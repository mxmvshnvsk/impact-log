import type { LoginRequest, secondFactorRequestSchema, User } from '@impact-log/shared'
import { and, eq, isNull } from 'drizzle-orm'
import type { z } from 'zod'
import type { Database } from '../../db/client'
import { recoveryCodes, type UserRow, users } from '../../db/schema'
import type { Cipher } from '../../lib/crypto'
import { sha256Hex } from '../../lib/crypto'
import { AppError } from '../../lib/errors'
import { hashPassword, verifyDummy, verifyPassword } from './password'
import { formatRecoveryCode, generateRecoveryCodes } from './recoveryCodes'
import {
  type ActiveSession,
  createSession,
  deleteSession,
  deleteUserSessions,
  MAX_CODE_ATTEMPTS,
  registerFailedAttempt,
  SESSION_TTL,
} from './sessions'
import { generateTotpKey, totpEnrollment, verifyTotp } from './totp'
import { forgetUserDevices, isTrustedDevice, trustDevice } from './trustedDevices'

type SecondFactorInput = z.output<typeof secondFactorRequestSchema>

type Deps = {
  db: Database
  cipher: Cipher
  registrationEnabled: boolean
}

export function toUserDto(user: UserRow): User {
  return {
    id: user.id,
    login: user.login,
    plan: user.plan,
    createdAt: user.createdAt.toISOString(),
  }
}

export function createAuthService({ db, cipher, registrationEnabled }: Deps) {
  /**
   * Шаг 1 регистрации: логин + пароль → незавершённый аккаунт и TOTP-секрет для приложения.
   * Аккаунт станет активным только после подтверждения кода (шаг 2).
   */
  async function startRegistration(
    input: { login: string; password: string },
    current: ActiveSession | null,
  ) {
    if (!registrationEnabled) throw new AppError('REGISTRATION_CLOSED', 403)

    const [existing] = await db.select().from(users).where(eq(users.login, input.login))
    if (existing) {
      const abandoned =
        existing.status === 'pending' &&
        existing.createdAt.getTime() < Date.now() - SESSION_TTL.enrollment
      const restartedByOwner =
        existing.status === 'pending' &&
        current?.kind === 'enrollment' &&
        current.user.id === existing.id
      if (!abandoned && !restartedByOwner) throw new AppError('LOGIN_TAKEN', 409)
      await db.delete(users).where(eq(users.id, existing.id))
    }

    const key = generateTotpKey()
    const [user] = await db
      .insert(users)
      .values({
        login: input.login,
        passwordHash: await hashPassword(input.password),
        totpSecret: cipher.encrypt(key),
      })
      .returning()
    if (!user) throw new Error('Failed to create user')

    const session = await createSession(db, user.id, 'enrollment')
    return { session, enrollment: totpEnrollment(key, user.login) }
  }

  /** Шаг 2 регистрации: первый код из приложения → аккаунт активен, выдаём резервные коды */
  async function confirmRegistration(current: ActiveSession, code: string) {
    const { user } = current
    const step = verifyTotp(cipher.decrypt(user.totpSecret), code, user.totpLastStep)
    if (step === null) await failCode(current)

    const codes = generateRecoveryCodes()
    const result = await db.transaction(async (tx) => {
      const [activated] = await tx
        .update(users)
        .set({ status: 'active', activatedAt: new Date(), totpLastStep: step })
        .where(eq(users.id, user.id))
        .returning()
      if (!activated) throw new Error('User disappeared')
      await tx
        .insert(recoveryCodes)
        .values(codes.map((c) => ({ userId: user.id, codeHash: sha256Hex(c) })))
      await deleteSession(tx, current.id)
      const session = await createSession(tx, user.id, 'full')
      return { user: activated, session }
    })

    return { ...result, recoveryCodes: codes.map(formatRecoveryCode) }
  }

  /**
   * Вход, шаг 1: логин + пароль → сессия «ждём второй фактор».
   * С доверенного устройства («Запомнить этот компьютер») код не нужен — сразу полная сессия на 30 дней.
   */
  async function login(input: LoginRequest, deviceToken: string | undefined) {
    const [user] = await db.select().from(users).where(eq(users.login, input.login))
    if (user?.status !== 'active') {
      await verifyDummy(input.password)
      throw new AppError('INVALID_CREDENTIALS', 401)
    }
    if (!(await verifyPassword(user.passwordHash, input.password))) {
      throw new AppError('INVALID_CREDENTIALS', 401)
    }
    if (deviceToken && (await isTrustedDevice(db, deviceToken, user.id))) {
      return {
        next: 'done' as const,
        user,
        session: await createSession(db, user.id, 'full', true),
      }
    }
    return {
      next: 'second-factor' as const,
      session: await createSession(db, user.id, 'second-factor'),
    }
  }

  /** Вход, шаг 2: код из приложения или резервный код → полная сессия */
  async function verifySecondFactor(current: ActiveSession, input: SecondFactorInput) {
    const { user } = current

    if (input.method === 'totp') {
      const step = verifyTotp(cipher.decrypt(user.totpSecret), input.code, user.totpLastStep)
      if (step === null) await failCode(current)
      await db.update(users).set({ totpLastStep: step }).where(eq(users.id, user.id))
    } else {
      const [used] = await db
        .update(recoveryCodes)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(recoveryCodes.userId, user.id),
            eq(recoveryCodes.codeHash, sha256Hex(input.code)),
            isNull(recoveryCodes.usedAt),
          ),
        )
        .returning({ id: recoveryCodes.id })
      if (!used) await failCode(current)
    }

    await deleteSession(db, current.id)
    const session = await createSession(db, user.id, 'full', input.remember)
    const device = input.remember ? await trustDevice(db, user.id) : null
    return { user, session, device }
  }

  /** everywhere — выход на всех устройствах и сброс доверенных устройств */
  async function logout(current: ActiveSession, everywhere = false) {
    if (everywhere) {
      await deleteUserSessions(db, current.user.id)
      await forgetUserDevices(db, current.user.id)
    } else {
      await deleteSession(db, current.id)
    }
  }

  /** Неверный код: считаем попытку; после лимита сессия сгорает и нужно начинать заново */
  async function failCode(current: ActiveSession): Promise<never> {
    const attempts = await registerFailedAttempt(db, current.id)
    if (attempts >= MAX_CODE_ATTEMPTS) {
      await deleteSession(db, current.id)
      throw new AppError('SESSION_EXPIRED', 401)
    }
    throw new AppError('INVALID_CODE', 400)
  }

  return { startRegistration, confirmRegistration, login, verifySecondFactor, logout }
}

export type AuthService = ReturnType<typeof createAuthService>
