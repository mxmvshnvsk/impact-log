import { randomUUID } from 'node:crypto'
import {
  DEFAULT_KDF_PARAMS,
  type LoginRequest,
  type PreloginResponse,
  type RecoveryCompleteRequest,
  type RegisterRequest,
} from '@impact-log/shared'
import { and, eq, gt, isNull, lt, or } from 'drizzle-orm'
import type { Database, Executor } from '../../db/client'
import { keyEnvelopes, sessions, type UserRow, users } from '../../db/schema'
import {
  type Cipher,
  decodeBase64Url,
  generateAccountId,
  safeEqualHex,
  sha256Hex,
} from '../../lib/crypto'
import { AppError } from '../../lib/errors'
import { uniqueViolation } from '../../lib/pg'
import {
  createDevice,
  type DeviceTrust,
  findDeviceBySecret,
  findTrustedDevice,
  findUsableDevice,
  forgetDeviceTrust,
  forgetOneDeviceTrust,
  newDeviceTrust,
  setDeviceTrust,
} from '../devices/devices'
import { putEnvelope } from '../keys/envelopes'
import { hashAuthKey, verifyAuthKey, verifyDummy } from './authKey'
import { fakeSalt } from './prelogin'
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
import { reserveTotpAttempt, TOTP_SUCCESS_RESET } from './totpGuard'

/** Тело codeRequestSchema после zod (remember уже с default) */
type CodeInput = { code: string; remember: boolean }

type Deps = {
  db: Database
  cipher: Cipher
  /** Ключ для детерминированной «фальшивой» соли prelogin (производная от серверного секрета) */
  preloginKey: Uint8Array
  registrationEnabled: boolean
}

/** Хеш recoveryAuthKey: SHA-256 от его байтов (hex) */
export function recoveryAuthHash(recoveryAuthKey: string): string {
  return sha256Hex(decodeBase64Url(recoveryAuthKey))
}

/** Для несуществующего логина сравниваем с «пустышкой», чтобы работа была одинаковой */
const DUMMY_RECOVERY_HASH = sha256Hex('impact-log-dummy-recovery-auth-key')

/** Сколько раз пробуем подобрать свободный accountId (коллизия 60 бит практически невозможна) */
const ACCOUNT_ID_ATTEMPTS = 5

export function createAuthService({ db, cipher, preloginKey, registrationEnabled }: Deps) {
  /** Жива ли ещё регистрационная сессия этого (pending) пользователя */
  async function hasLiveEnrollment(userId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          eq(sessions.kind, 'enrollment'),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1)
    return row !== undefined
  }

  /** Соль и параметры KDF. Для несуществующих и незавершённых логинов — детерминированная подделка */
  async function prelogin(login: string): Promise<PreloginResponse> {
    const [user] = await db
      .select({ status: users.status, kdf: users.kdfParams, salt: users.kdfSalt })
      .from(users)
      .where(eq(users.login, login))
    if (user?.status === 'active') return { kdf: user.kdf, salt: user.salt }
    return { kdf: DEFAULT_KDF_PARAMS, salt: fakeSalt(preloginKey, login) }
  }

  /**
   * Шаг 1 регистрации: логин, authKey, KDF и оба конверта → незавершённый аккаунт и TOTP для приложения.
   * Аккаунт станет активным только после подтверждения кода (шаг 2).
   */
  async function startRegistration(input: RegisterRequest, current: ActiveSession | null) {
    if (!registrationEnabled) throw new AppError('REGISTRATION_CLOSED', 403)

    const [existing] = await db.select().from(users).where(eq(users.login, input.login))
    if (existing) {
      // Брошенная регистрация: срок вышел или у неё не осталось живой enrollment-сессии
      // (например, сгорела после лимита неверных кодов) — логин можно занять заново
      const abandoned =
        existing.status === 'pending' &&
        (existing.createdAt.getTime() < Date.now() - SESSION_TTL.enrollment ||
          !(await hasLiveEnrollment(existing.id)))
      const restartedByOwner =
        existing.status === 'pending' &&
        current?.kind === 'enrollment' &&
        current.user.id === existing.id
      if (!abandoned && !restartedByOwner) throw new AppError('LOGIN_TAKEN', 409)
      await db.delete(users).where(eq(users.id, existing.id))
    }

    const key = generateTotpKey()
    // id генерируем здесь: он нужен как AAD шифрования TOTP-секрета ещё до вставки строки
    const id = randomUUID()
    const values = {
      id,
      login: input.login,
      authKeyHash: await hashAuthKey(input.authKey),
      kdfParams: input.kdf,
      kdfSalt: input.salt,
      totpSecret: cipher.encrypt(key, id),
      recoveryAuthHash: recoveryAuthHash(input.recoveryAuthKey),
    }

    const user = await db.transaction(async (tx) => {
      const created = await insertUser(tx, values)
      await putEnvelope(tx, created.id, 'password', input.passwordEnvelope)
      await putEnvelope(tx, created.id, 'recovery', input.recoveryEnvelope)
      return created
    })

    const session = await createSession(db, user.id, 'enrollment')
    return { session, enrollment: totpEnrollment(key, user.login) }
  }

  /** Вставка пользователя со свежим accountId; при коллизии accountId — повтор (savepoint) */
  async function insertUser(
    tx: Executor,
    values: Omit<typeof users.$inferInsert, 'accountId'>,
  ): Promise<UserRow> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await tx.transaction(async (savepoint) => {
          const [user] = await savepoint
            .insert(users)
            .values({ ...values, accountId: generateAccountId() })
            .returning()
          if (!user) throw new Error('Failed to create user')
          return user
        })
      } catch (error) {
        const constraint = uniqueViolation(error)
        if (constraint === 'users_login_unique') throw new AppError('LOGIN_TAKEN', 409)
        if (constraint !== 'users_account_id_unique' || attempt >= ACCOUNT_ID_ATTEMPTS) throw error
      }
    }
  }

  /**
   * Проверка кода по действующему секрету с учётом блокировки перебора (totpGuard) и лимита попыток
   * сессии. Возвращает шаг TOTP; неверный код — INVALID_CODE / SESSION_EXPIRED.
   */
  async function checkSessionCode(current: ActiveSession, code: string): Promise<number> {
    const { user } = current
    await reserveTotpAttempt(db, user.id)
    return (
      verifyTotp(cipher.decrypt(user.totpSecret, user.id), code, user.totpLastStep) ??
      (await failCode(current))
    )
  }

  /** Шаг 2 регистрации: первый код из приложения → аккаунт активен, первое устройство, полная сессия */
  async function confirmRegistration(current: ActiveSession, input: CodeInput) {
    const { user } = current
    const step = await checkSessionCode(current, input.code)
    const trust = input.remember ? newDeviceTrust() : null

    return db.transaction(async (tx) => {
      const [activated] = await tx
        .update(users)
        .set({
          status: 'active',
          activatedAt: new Date(),
          totpLastStep: step,
          ...TOTP_SUCCESS_RESET,
        })
        .where(and(eq(users.id, user.id), eq(users.status, 'pending')))
        .returning()
      if (!activated) throw new AppError('SESSION_EXPIRED', 401)
      const { device, secret } = await createDevice(tx, user.id, trust)
      await deleteSession(tx, current.id)
      const session = await createSession(tx, user.id, 'full', {
        persistent: input.remember,
        deviceId: device.id,
      })
      return { user: activated, deviceId: device.id, deviceSecret: secret, session, trust }
    })
  }

  /**
   * Вход, шаг 1: логин + authKey → сессия «ждём второй фактор» (с кандидатом deviceId).
   * С доверенного устройства («Запомнить этот компьютер») код не нужен — сразу полная сессия на 30 дней.
   */
  async function login(input: LoginRequest, trustToken: string | undefined) {
    const [user] = await db.select().from(users).where(eq(users.login, input.login))
    if (user?.status !== 'active') {
      await verifyDummy(input.authKey)
      throw new AppError('INVALID_CREDENTIALS', 401)
    }
    if (!(await verifyAuthKey(user.authKeyHash, input.authKey))) {
      throw new AppError('INVALID_CREDENTIALS', 401)
    }

    const trusted = trustToken ? await findTrustedDevice(db, user.id, trustToken) : null
    if (trusted) {
      const session = await createSession(db, user.id, 'full', {
        persistent: true,
        deviceId: trusted.id,
      })
      return { next: 'done' as const, user, deviceId: trusted.id, session }
    }

    // Переданный deviceId запоминаем, только если это живое устройство этого пользователя
    // и клиент предъявил его секрет — иначе после кода будет создано новое устройство
    const candidate = await findDeviceBySecret(db, user.id, input.deviceId, input.deviceSecret)
    const session = await createSession(db, user.id, 'second-factor', {
      deviceId: candidate?.id ?? null,
    })
    return { next: 'second-factor' as const, session }
  }

  /** Вход, шаг 2: код из приложения → полная сессия на устройстве-кандидате или новом */
  async function verifySecondFactor(current: ActiveSession, input: CodeInput) {
    const { user } = current
    const step = await checkSessionCode(current, input.code)
    const trust = input.remember ? newDeviceTrust() : null

    return db.transaction(async (tx) => {
      // Условное обновление: два параллельных запроса с одним кодом не пройдут оба
      const [updated] = await tx
        .update(users)
        .set({ totpLastStep: step, ...TOTP_SUCCESS_RESET })
        .where(
          and(eq(users.id, user.id), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))),
        )
        .returning()
      if (!updated) throw new AppError('INVALID_CODE', 400)
      // Кандидат уже прошёл проверку секрета при login — здесь только «не отозван ли с тех пор»
      const candidate = current.deviceId
        ? await findUsableDevice(tx, user.id, current.deviceId)
        : null
      const device = await useOrCreateDevice(tx, user.id, candidate, trust)
      await deleteSession(tx, current.id)
      const session = await createSession(tx, user.id, 'full', {
        persistent: input.remember,
        deviceId: device.deviceId,
      })
      return { user: updated, ...device, session, trust }
    })
  }

  /**
   * Проверенное устройство-кандидат (с новым «доверием», если нужно) или новое устройство.
   * deviceSecret — только у нового: клиент сохранит его и предъявит при следующем входе.
   */
  async function useOrCreateDevice(
    tx: Executor,
    userId: string,
    candidate: { id: string } | null,
    trust: DeviceTrust | null,
  ): Promise<{ deviceId: string; deviceSecret?: string }> {
    if (!candidate) {
      const { device, secret } = await createDevice(tx, userId, trust)
      return { deviceId: device.id, deviceSecret: secret }
    }
    if (trust) await setDeviceTrust(tx, candidate.id, trust)
    return { deviceId: candidate.id }
  }

  /**
   * Восстановление, шаг 1: владение Recovery Key (recoveryAuthKey) → recovery-конверт и короткая сессия.
   * Неверный логин и неверный ключ неразличимы: одинаковые запрос в БД, хеш и сравнение.
   */
  async function beginRecovery(input: { login: string; recoveryAuthKey: string }) {
    const [row] = await db
      .select({ user: users, envelope: keyEnvelopes.envelope })
      .from(users)
      .leftJoin(
        keyEnvelopes,
        and(eq(keyEnvelopes.userId, users.id), eq(keyEnvelopes.type, 'recovery')),
      )
      .where(eq(users.login, input.login))
    const active = row?.user.status === 'active' ? row : null
    const matches = safeEqualHex(
      recoveryAuthHash(input.recoveryAuthKey),
      active?.user.recoveryAuthHash ?? DUMMY_RECOVERY_HASH,
    )
    if (!active || !matches || !active.envelope) throw new AppError('INVALID_CREDENTIALS', 401)

    const session = await createSession(db, active.user.id, 'recovery')
    return { session, recoveryEnvelope: active.envelope }
  }

  /**
   * Восстановление, шаг 2: новый пароль (authKey, KDF, соль, конверт того же MK).
   * Все сессии пользователя удаляются, «доверие» снимается со всех устройств, блокировка перебора TOTP
   * снимается (владение Recovery Key доказано, а все, кто подбирал код, потеряли и пароль, и сессии).
   * Новая сессия помечена viaRecovery: в ней можно перевыпустить 2FA без текущего кода.
   */
  async function completeRecovery(current: ActiveSession, input: RecoveryCompleteRequest) {
    const authKeyHash = await hashAuthKey(input.authKey)
    return db.transaction(async (tx) => {
      const [user] = await tx
        .update(users)
        .set({ authKeyHash, kdfParams: input.kdf, kdfSalt: input.salt, ...TOTP_SUCCESS_RESET })
        .where(eq(users.id, current.user.id))
        .returning()
      if (!user) throw new AppError('SESSION_EXPIRED', 401)
      await putEnvelope(tx, user.id, 'password', input.passwordEnvelope)
      await deleteUserSessions(tx, user.id)
      await forgetDeviceTrust(tx, user.id)
      const candidate = await findDeviceBySecret(tx, user.id, input.deviceId, input.deviceSecret)
      const device = await useOrCreateDevice(tx, user.id, candidate, null)
      const session = await createSession(tx, user.id, 'full', {
        deviceId: device.deviceId,
        viaRecovery: true,
      })
      return { user, ...device, session }
    })
  }

  /**
   * everywhere — выход на всех устройствах и сброс доверенных устройств;
   * forgetDevice — снять доверие только с текущего устройства
   */
  async function logout(
    current: ActiveSession,
    options: { everywhere?: boolean; forgetDevice?: boolean } = {},
  ) {
    if (options.everywhere) {
      await db.transaction(async (tx) => {
        await deleteUserSessions(tx, current.user.id)
        await forgetDeviceTrust(tx, current.user.id)
      })
      return
    }
    await db.transaction(async (tx) => {
      await deleteSession(tx, current.id)
      if (options.forgetDevice && current.deviceId) await forgetOneDeviceTrust(tx, current.deviceId)
    })
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

  return {
    prelogin,
    startRegistration,
    confirmRegistration,
    login,
    verifySecondFactor,
    beginRecovery,
    completeRecovery,
    logout,
  }
}

export type AuthService = ReturnType<typeof createAuthService>
