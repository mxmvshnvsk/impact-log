import { randomUUID } from 'node:crypto'
import {
  DEFAULT_KDF_PARAMS,
  type LoginRequest,
  type PreloginResponse,
  type RecoveryCompleteRequest,
  type RegisterRequest,
} from '@impact-log/shared'
import { and, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm'
import type { Database, Executor } from '../../db/client'
import { keyEnvelopes, type RecoveryStage, sessions, type UserRow, users } from '../../db/schema'
import {
  type Cipher,
  decodeBase64Url,
  generateAccountId,
  type LoginHasher,
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
import { cancelRotation } from '../keys/rotationStore'
import { hashAuthKey, verifyAuthKey, verifyDummy } from './authKey'
import {
  CLEAR_DELAYED_RECOVERY,
  delayedRecoveryStatus,
  startDelayedRecovery,
} from './delayedRecovery'
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
  /** HMAC логина: в users хранится только он, сам логин — нигде */
  hashLogin: LoginHasher
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

export function createAuthService({
  db,
  cipher,
  preloginKey,
  hashLogin,
  registrationEnabled,
}: Deps) {
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
      .where(eq(users.loginHash, hashLogin(login)))
    if (user?.status === 'active') return { kdf: user.kdf, salt: user.salt }
    return { kdf: DEFAULT_KDF_PARAMS, salt: fakeSalt(preloginKey, login) }
  }

  /**
   * Шаг 1 регистрации: логин, authKey, KDF и оба конверта → незавершённый аккаунт и TOTP для приложения.
   * Аккаунт станет активным только после подтверждения кода (шаг 2).
   */
  async function startRegistration(input: RegisterRequest, current: ActiveSession | null) {
    if (!registrationEnabled) throw new AppError('REGISTRATION_CLOSED', 403)

    const loginHash = hashLogin(input.login)
    const [existing] = await db.select().from(users).where(eq(users.loginHash, loginHash))
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
      loginHash,
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
    return { session, enrollment: totpEnrollment(key) }
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
        if (constraint === 'users_login_hash_unique') throw new AppError('LOGIN_TAKEN', 409)
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
      (await failAttempt(current, new AppError('INVALID_CODE', 400)))
    )
  }

  /**
   * Фиксирует использованный шаг TOTP и сбрасывает счётчик неудач. Условное обновление: два параллельных
   * запроса с одним кодом не пройдут оба (второй — INVALID_CODE)
   */
  async function commitTotpStep(tx: Executor, userId: string, step: number): Promise<UserRow> {
    const [updated] = await tx
      .update(users)
      .set({ totpLastStep: step, ...TOTP_SUCCESS_RESET })
      .where(
        and(eq(users.id, userId), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))),
      )
      .returning()
    if (!updated) throw new AppError('INVALID_CODE', 400)
    return updated
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
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.loginHash, hashLogin(input.login)))
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
      const updated = await commitTotpStep(tx, user.id, step)
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
   * Вход, второй фактор — Recovery Key вместо кода (путь B: пароль уже проверен в /login, телефона нет).
   * Неверный ключ — попытка сессии, как неверный код (после MAX_CODE_ATTEMPTS сессия сгорает).
   * Верный — новый TOTP-секрет ждёт подтверждения в той же сессии, она становится totp-reset
   * (попытки обнуляются, срок — заново). Старая 2FA работает, пока новая не подтверждена.
   */
  async function loginWithRecoveryKey(current: ActiveSession, recoveryAuthKey: string) {
    const { user } = current
    if (!safeEqualHex(recoveryAuthHash(recoveryAuthKey), user.recoveryAuthHash)) {
      return failAttempt(current, new AppError('INVALID_CREDENTIALS', 401))
    }
    const key = generateTotpKey()
    const [updated] = await db
      .update(sessions)
      .set({
        kind: 'totp-reset',
        attempts: 0,
        expiresAt: new Date(Date.now() + SESSION_TTL['totp-reset']),
        totpPendingSecret: cipher.encrypt(key, user.id),
      })
      .where(and(eq(sessions.id, current.id), eq(sessions.kind, 'second-factor')))
      .returning({ id: sessions.id })
    if (!updated) throw new AppError('SESSION_EXPIRED', 401)
    return totpEnrollment(key)
  }

  /**
   * Путь B, шаг 2: первый код новой 2FA → старый секрет заменён, все остальные сессии завершены, доверие
   * снято со всех устройств (remember — доверие только этому), отложенное восстановление снято.
   *
   * Блокировка перебора TOTP (totpGuard) здесь не проверяется и не растёт: она защищает действующий
   * секрет от того, кто знает пароль, а этот код — от секрета, который сессия только что выдала сама
   * после пароля и Recovery Key; подбирать нечего. Иначе заблокированная чужим перебором 2FA мешала бы
   * владельцу её сбросить. Перебор ограничен попытками сессии и лимитом по IP; успех снимает блокировку.
   */
  async function confirmTotpReset(current: ActiveSession, input: CodeInput) {
    const { user } = current
    const pending = current.totpPendingSecret
    if (!pending) throw new AppError('SESSION_EXPIRED', 401)
    const step =
      verifyTotp(cipher.decrypt(pending, user.id), input.code, null) ??
      (await failAttempt(current, new AppError('INVALID_CODE', 400)))
    const trust = input.remember ? newDeviceTrust() : null

    return db.transaction(async (tx) => {
      // Сессия одноразовая: параллельный запрос с тем же кодом (или после перевыпуска ключа) не пройдёт
      const [consumed] = await tx
        .delete(sessions)
        .where(and(eq(sessions.id, current.id), eq(sessions.kind, 'totp-reset')))
        .returning({ secret: sessions.totpPendingSecret })
      if (consumed?.secret !== pending) throw new AppError('SESSION_EXPIRED', 401)
      const [updated] = await tx
        .update(users)
        .set({
          totpSecret: pending,
          totpPendingSecret: null,
          totpLastStep: step,
          ...TOTP_SUCCESS_RESET,
          ...CLEAR_DELAYED_RECOVERY,
        })
        .where(eq(users.id, user.id))
        .returning()
      if (!updated) throw new AppError('SESSION_EXPIRED', 401)
      await deleteUserSessions(tx, user.id)
      await forgetDeviceTrust(tx, user.id)
      const candidate = current.deviceId
        ? await findUsableDevice(tx, user.id, current.deviceId)
        : null
      const device = await useOrCreateDevice(tx, user.id, candidate, trust)
      const session = await createSession(tx, user.id, 'full', {
        persistent: input.remember,
        deviceId: device.deviceId,
      })
      return { user: updated, ...device, session, trust }
    })
  }

  /**
   * Восстановление, шаг 1: владение Recovery Key (recoveryAuthKey) → recovery-сессия в стадии key
   * и состояние отложенного восстановления. Конверт здесь НЕ выдаётся — только после второго фактора
   * (verify) или задержки (resume). Неверный логин и неверный ключ неразличимы: одинаковые запрос в БД,
   * хеш и сравнение.
   */
  async function beginRecovery(input: { login: string; recoveryAuthKey: string }) {
    const [row] = await db
      .select({ user: users, envelope: keyEnvelopes.envelope })
      .from(users)
      .leftJoin(
        keyEnvelopes,
        and(eq(keyEnvelopes.userId, users.id), eq(keyEnvelopes.type, 'recovery')),
      )
      .where(eq(users.loginHash, hashLogin(input.login)))
    const active = row?.user.status === 'active' ? row : null
    const matches = safeEqualHex(
      recoveryAuthHash(input.recoveryAuthKey),
      active?.user.recoveryAuthHash ?? DUMMY_RECOVERY_HASH,
    )
    if (!active || !matches || !active.envelope) throw new AppError('INVALID_CREDENTIALS', 401)

    const session = await createSession(db, active.user.id, 'recovery')
    return { session, delayed: delayedRecoveryStatus(active.user.recoveryAvailableAt) }
  }

  /** Recovery-конверт (есть у каждого активного аккаунта) */
  async function recoveryEnvelopeOf(tx: Executor, userId: string): Promise<string> {
    const [row] = await tx
      .select({ envelope: keyEnvelopes.envelope })
      .from(keyEnvelopes)
      .where(and(eq(keyEnvelopes.userId, userId), eq(keyEnvelopes.type, 'recovery')))
    if (!row) throw new AppError('SESSION_EXPIRED', 401)
    return row.envelope
  }

  /**
   * Новая стадия recovery-сессии и recovery-конверт — в одной транзакции. Сессию успели удалить
   * (отмена, перевыпуск ключа, смена пароля) → 401: конверт не выдаётся.
   */
  async function unlockRecovery(tx: Executor, current: ActiveSession, stage: RecoveryStage) {
    const [updated] = await tx
      .update(sessions)
      .set({ recoveryStage: stage })
      .where(and(eq(sessions.id, current.id), eq(sessions.kind, 'recovery')))
      .returning({ id: sessions.id })
    if (!updated) throw new AppError('SESSION_EXPIRED', 401)
    return { recoveryEnvelope: await recoveryEnvelopeOf(tx, current.user.id) }
  }

  /**
   * Путь A: код 2FA в recovery-сессии → стадия unlocked-totp и recovery-конверт. Проверка — как при входе:
   * блокировка перебора на пользователя (totpGuard), защита от повтора, попытки сессии.
   */
  async function verifyRecovery(current: ActiveSession, code: string) {
    const step = await checkSessionCode(current, code)
    return db.transaction(async (tx) => {
      await commitTotpStep(tx, current.user.id, step)
      return unlockRecovery(tx, current, 'unlocked-totp')
    })
  }

  /** Путь C: запустить отсчёт (или вернуть идущий срок) */
  async function delayRecovery(current: ActiveSession) {
    return startDelayedRecovery(db, current.user.id)
  }

  /**
   * Путь C: задержка прошла → стадия unlocked-delayed и recovery-конверт. Рано → 403 RECOVERY_NOT_READY
   * с details.availableAt; не начато или истекло → 403 RECOVERY_NOT_READY без details.
   * Если код 2FA в этой сессии уже подтверждён (unlocked-totp), стадия остаётся более сильной.
   */
  async function resumeRecovery(current: ActiveSession) {
    const delayed = delayedRecoveryStatus(current.user.recoveryAvailableAt)
    if (delayed.status === 'none') throw new AppError('RECOVERY_NOT_READY', 403)
    if (delayed.status === 'pending') {
      throw new AppError('RECOVERY_NOT_READY', 403, { availableAt: delayed.availableAt })
    }
    const stage = current.recoveryStage === 'unlocked-totp' ? 'unlocked-totp' : 'unlocked-delayed'
    return db.transaction((tx) => unlockRecovery(tx, current, stage))
  }

  /**
   * Восстановление, последний шаг — только после verify (A) или resume (C), иначе 403 FORBIDDEN:
   * новый пароль (authKey, KDF, соль, конверт того же MK). Все сессии пользователя удаляются, «доверие»
   * снимается со всех устройств, блокировка перебора TOTP снимается, отложенное восстановление снимается.
   * Новая сессия помечена viaRecovery только после пути C (перевыпуск 2FA без текущего кода — телефона нет);
   * после пути A 2FA у пользователя есть. Идущая ротация MK отменяется: её password-конверт сделан старым
   * паролем, а новый password-конверт — прежнего MK (ADR-0012).
   */
  async function completeRecovery(current: ActiveSession, input: RecoveryCompleteRequest) {
    const stage = current.recoveryStage
    if (stage !== 'unlocked-totp' && stage !== 'unlocked-delayed') {
      throw new AppError('FORBIDDEN', 403)
    }
    const delayed = stage === 'unlocked-delayed'
    const authKeyHash = await hashAuthKey(input.authKey)
    return db.transaction(async (tx) => {
      // Recovery-сессия одноразовая: параллельный complete (или после отмены) не пройдёт
      const [consumed] = await tx
        .delete(sessions)
        .where(
          and(
            eq(sessions.id, current.id),
            eq(sessions.kind, 'recovery'),
            eq(sessions.recoveryStage, stage),
          ),
        )
        .returning({ id: sessions.id })
      if (!consumed) throw new AppError('SESSION_EXPIRED', 401)
      const [user] = await tx
        .update(users)
        .set({
          authKeyHash,
          kdfParams: input.kdf,
          kdfSalt: input.salt,
          ...TOTP_SUCCESS_RESET,
          ...CLEAR_DELAYED_RECOVERY,
        })
        // Путь C: отложенное восстановление не отменили с тех пор (отмена удаляет и сессию — это запас)
        .where(
          and(
            eq(users.id, current.user.id),
            delayed ? isNotNull(users.recoveryAvailableAt) : undefined,
          ),
        )
        .returning()
      if (!user) throw new AppError('RECOVERY_NOT_READY', 403)
      await putEnvelope(tx, user.id, 'password', input.passwordEnvelope)
      await cancelRotation(tx, user.id)
      await deleteUserSessions(tx, user.id)
      await forgetDeviceTrust(tx, user.id)
      const candidate = await findDeviceBySecret(tx, user.id, input.deviceId, input.deviceSecret)
      const device = await useOrCreateDevice(tx, user.id, candidate, null)
      const session = await createSession(tx, user.id, 'full', {
        deviceId: device.deviceId,
        viaRecovery: delayed,
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

  /**
   * Неверный код (или Recovery Key вместо кода): считаем попытку сессии и бросаем error;
   * после лимита сессия сгорает (SESSION_EXPIRED) и нужно начинать заново
   */
  async function failAttempt(current: ActiveSession, error: AppError): Promise<never> {
    const attempts = await registerFailedAttempt(db, current.id)
    if (attempts >= MAX_CODE_ATTEMPTS) {
      await deleteSession(db, current.id)
      throw new AppError('SESSION_EXPIRED', 401)
    }
    throw error
  }

  return {
    prelogin,
    startRegistration,
    confirmRegistration,
    login,
    verifySecondFactor,
    loginWithRecoveryKey,
    confirmTotpReset,
    beginRecovery,
    verifyRecovery,
    delayRecovery,
    resumeRecovery,
    completeRecovery,
    logout,
  }
}

export type AuthService = ReturnType<typeof createAuthService>
