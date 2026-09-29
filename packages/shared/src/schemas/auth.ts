import { z } from 'zod'
import { PLAN_IDS } from '../entitlements'

/*
 * Сообщения об ошибках валидации — ключи i18n (validation.<key>), а не тексты.
 * Одни и те же схемы проверяют формы на фронте и тела запросов на бэке.
 *
 * Модель (ADR-0006, ADR-0008): пароль НИКОГДА не уходит на сервер. Клиент получает соль и параметры
 * KDF (prelogin), выводит из пароля Argon2id два независимых ключа — KEK (открывает конверт с Master Key,
 * остаётся на клиенте) и authKey (доказывает знание пароля серверу). Сервер хранит только хеш authKey.
 */

export const LOGIN_MIN = 3
export const LOGIN_MAX = 32
export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 128
export const TOTP_DIGITS = 6

export const loginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(LOGIN_MIN, 'login.tooShort')
  .max(LOGIN_MAX, 'login.tooLong')
  .regex(/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/, 'login.format')

/** Только для форм на клиенте — на сервер пароль не отправляется */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, 'password.tooShort')
  .max(PASSWORD_MAX, 'password.tooLong')

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${TOTP_DIGITS}}$`), 'code.format')

/** base64url без паддинга, ровно `bytes` байт */
export const base64UrlBytesSchema = (bytes: number) =>
  z
    .string()
    .length(Math.ceil((bytes * 4) / 3), 'format')
    .regex(/^[A-Za-z0-9_-]+$/, 'format')

export const AUTH_KEY_BYTES = 32
export const KDF_SALT_BYTES = 16
export const DEVICE_SECRET_BYTES = 32

/** Ключ аутентификации, выведенный на клиенте (из пароля или из Recovery Key) */
export const authKeySchema = base64UrlBytesSchema(AUTH_KEY_BYTES)
export const kdfSaltSchema = base64UrlBytesSchema(KDF_SALT_BYTES)
/**
 * Секрет устройства: выдаётся один раз при создании устройства, на сервере — только SHA-256.
 * Повторно использовать deviceId можно, только предъявив секрет (иначе создаётся новое устройство) —
 * так чужая сессия не спрячется под id вашего устройства.
 */
export const deviceSecretSchema = base64UrlBytesSchema(DEVICE_SECRET_BYTES)

/** Параметры Argon2id. Нижняя граница — защита от «ослабленных» параметров, подсунутых сервером */
export const kdfParamsSchema = z.object({
  id: z.literal('argon2id'),
  memoryKiB: z
    .number()
    .int()
    .min(19 * 1024)
    .max(1024 * 1024),
  iterations: z.number().int().min(2).max(16),
  parallelism: z.number().int().min(1).max(4),
})
export type KdfParams = z.infer<typeof kdfParamsSchema>

/** Параметры по умолчанию v1: 64 МиБ, 3 прохода */
export const DEFAULT_KDF_PARAMS: KdfParams = {
  id: 'argon2id',
  memoryKiB: 64 * 1024,
  iterations: 3,
  parallelism: 1,
}

/** Сериализованный ключевой конверт — сервер хранит как есть */
export const envelopeTextSchema = z.string().min(1).max(4096)

// ---------- пользователь и сессия ----------

/**
 * Логина здесь нет намеренно: сервер хранит только HMAC-SHA256 от логина под серверным ключом и вернуть
 * его не может. Логин знает клиент — он его ввёл.
 */
export const userSchema = z.object({
  id: z.uuid(),
  /** Непрозрачный публичный ID аккаунта (12 символов Crockford Base32), не кодирует регион */
  accountId: z.string(),
  plan: z.enum(PLAN_IDS),
  createdAt: z.string(),
})
export type User = z.infer<typeof userSchema>

/** Ответ везде, где создаётся полноценная сессия, и GET /api/auth/me */
export const sessionResponseSchema = z.object({
  user: userSchema,
  /** Устройство этой сессии (per-client device identity) — клиент хранит его и передаёт при входе */
  deviceId: z.uuid(),
  /** Только если устройство создано этим запросом: секрет для повторного использования deviceId */
  deviceSecret: deviceSecretSchema.optional(),
})
export type SessionResponse = z.infer<typeof sessionResponseSchema>
/** Идёт восстановление доступа с задержкой (Recovery Key без пароля и без 2FA) — показать предупреждение */
export const recoveryPendingSchema = z.object({
  /** Когда восстановление станет доступно (started + 48 ч) */
  availableAt: z.string(),
})
export type RecoveryPending = z.infer<typeof recoveryPendingSchema>

/** GET /api/auth/me — сессия + состояние безопасности аккаунта */
export const meResponseSchema = sessionResponseSchema.extend({
  recoveryPending: recoveryPendingSchema.nullable(),
})
export type MeResponse = z.infer<typeof meResponseSchema>

// ---------- prelogin ----------

/** POST /api/auth/prelogin — соль и KDF. Для несуществующих логинов — детерминированная «фальшивая» соль */
export const preloginRequestSchema = z.object({ login: loginSchema })
export const preloginResponseSchema = z.object({ kdf: kdfParamsSchema, salt: kdfSaltSchema })
export type PreloginResponse = z.infer<typeof preloginResponseSchema>

// ---------- регистрация (включение синхронизации для локального хранилища) ----------

/**
 * POST /api/auth/register — шаг 1: логин, authKey, параметры KDF и оба конверта MK.
 * Ответ — TOTP-секрет для приложения; аккаунт станет активным после подтверждения кода.
 */
export const registerRequestSchema = z.object({
  login: loginSchema,
  authKey: authKeySchema,
  kdf: kdfParamsSchema,
  salt: kdfSaltSchema,
  passwordEnvelope: envelopeTextSchema,
  recoveryEnvelope: envelopeTextSchema,
  recoveryAuthKey: authKeySchema,
})
export type RegisterRequest = z.infer<typeof registerRequestSchema>

/**
 * Новый TOTP-секрет (base32, группами по 4) — ответ регистрации, сброса и перевыпуска 2FA.
 * otpauth:// URI для QR собирает клиент (totpKeyUri): в нём логин, а логина у сервера нет.
 */
export const totpSecretResponseSchema = z.object({ secret: z.string() })
export type TotpSecretResponse = z.infer<typeof totpSecretResponseSchema>

/** Что показывает экран подключения 2FA: секрет для ручного ввода и URI для QR */
export interface TotpEnrollment {
  secret: string
  otpauthUri: string
}

export const TOTP_ISSUER = 'impact log'
export const TOTP_PERIOD_SECONDS = 30

/**
 * otpauth://totp/… (Key Uri Format): SHA-1, TOTP_DIGITS цифр, шаг TOTP_PERIOD_SECONDS — как проверяет сервер.
 * accountName — логин, как его ввёл пользователь (после loginSchema). Пробел кодируется как %20 (RFC 3986),
 * не «+»: иначе часть приложений покажет издателя как «impact+log».
 */
export function totpKeyUri(accountName: string, secret: string): string {
  const issuer = encodeURIComponent(TOTP_ISSUER)
  const query = [
    `issuer=${issuer}`,
    'algorithm=SHA1',
    `secret=${encodeURIComponent(secret.replace(/\s+/g, '').toUpperCase())}`,
    `period=${TOTP_PERIOD_SECONDS}`,
    `digits=${TOTP_DIGITS}`,
  ]
  return `otpauth://totp/${issuer}:${encodeURIComponent(accountName)}?${query.join('&')}`
}

/** remember — «Запомнить этот компьютер»: сессия на 30 дней и вход без кода с этого устройства */
export const codeRequestSchema = z.object({
  code: totpCodeSchema,
  remember: z.boolean().default(false),
})
export type CodeRequest = z.input<typeof codeRequestSchema>

/** POST /api/auth/register/confirm → sessionResponseSchema */
export const registerConfirmRequestSchema = codeRequestSchema

// ---------- вход ----------

/** POST /api/auth/login */
export const loginRequestSchema = z.object({
  login: loginSchema,
  authKey: authKeySchema,
  /** Ранее выданный deviceId этого клиента — чтобы не плодить устройства при каждом входе */
  deviceId: z.uuid().optional(),
  /** Секрет этого устройства; без верного секрета deviceId игнорируется */
  deviceSecret: deviceSecretSchema.optional(),
})
export type LoginRequest = z.infer<typeof loginRequestSchema>

/** Нужен второй фактор — или устройство доверенное, и вход уже выполнен */
export const loginResponseSchema = z.discriminatedUnion('next', [
  z.object({ next: z.literal('second-factor') }),
  z.object({ next: z.literal('done'), user: userSchema, deviceId: z.uuid() }),
])
export type LoginResponse = z.infer<typeof loginResponseSchema>

/** POST /api/auth/login/verify → sessionResponseSchema */
export const secondFactorRequestSchema = codeRequestSchema
export type SecondFactorRequest = CodeRequest

// ---------- восстановление доступа по Recovery Key (ADR-0008 §7) ----------
/*
 * Recovery Key + ЕЩЁ ОДИН фактор:
 *   A. забыл пароль:   Recovery Key + код 2FA          → новый пароль (/recover);
 *   B. потерял телефон: пароль + Recovery Key вместо кода → новая 2FA   (/login, шаг второго фактора);
 *   C. потерял всё:    Recovery Key без пароля и кода   → новый пароль и новая 2FA, но только через
 *                      RECOVERY_DELAY_HOURS после запуска; всё это время вошедшие устройства видят
 *                      предупреждение (GET /api/auth/me → recoveryPending) и могут отменить.
 * Конверт MK под Recovery Key сервер отдаёт только после второго фактора (A) или по истечении задержки (C).
 */
export const RECOVERY_DELAY_HOURS = 48
/** Сколько отложенное восстановление остаётся доступным после созревания, потом его нужно начинать заново */
export const RECOVERY_READY_TTL_DAYS = 7

/**
 * POST /api/auth/recovery/begin — доказать владение Recovery Key (recoveryAuthKey выводится из него на клиенте).
 * Создаёт короткую recovery-сессию; конверт ещё НЕ выдаётся. Неверный ключ/логин → 401 INVALID_CREDENTIALS.
 */
export const recoveryBeginRequestSchema = z.object({
  login: loginSchema,
  recoveryAuthKey: authKeySchema,
})
export const recoveryBeginResponseSchema = z.object({
  /**
   * Отложенное восстановление этого аккаунта: none — не начато; pending — идёт отсчёт;
   * ready — задержка прошла, можно продолжить без 2FA (POST /recovery/resume)
   */
  delayed: z.discriminatedUnion('status', [
    z.object({ status: z.literal('none') }),
    z.object({ status: z.literal('pending'), availableAt: z.string() }),
    z.object({ status: z.literal('ready'), availableAt: z.string() }),
  ]),
})
export type RecoveryBeginResponse = z.infer<typeof recoveryBeginResponseSchema>

/** Конверт MK под Recovery Key — выдаётся после второго фактора или после задержки */
export const recoveryUnlockResponseSchema = z.object({ recoveryEnvelope: envelopeTextSchema })

/** A. POST /api/auth/recovery/verify (recovery-сессия) — код 2FA; учитывается в блокировке перебора TOTP */
export const recoveryVerifyRequestSchema = z.object({ code: totpCodeSchema })

/**
 * C. POST /api/auth/recovery/delay (recovery-сессия, без тела) — запустить отсчёт RECOVERY_DELAY_HOURS.
 * Идемпотентно: если отсчёт уже идёт, возвращает прежний срок.
 */
export const recoveryDelayResponseSchema = recoveryPendingSchema

/**
 * C. POST /api/auth/recovery/resume (recovery-сессия, без тела) — задержка прошла → recoveryUnlockResponseSchema.
 * Рано → 403 RECOVERY_NOT_READY (details.availableAt); не начато или истекло → 403 RECOVERY_NOT_READY без details.
 */

/**
 * POST /api/auth/recovery/complete (recovery-сессия после verify или resume) — новый пароль: authKey, KDF, соль,
 * конверт. Все остальные сессии и «Запомнить компьютер» сбрасываются, отложенное восстановление снимается.
 * После пути C новая сессия помечена via_recovery: перевыпуск 2FA без текущего кода (телефона-то нет).
 * Ответ — sessionResponseSchema. До verify/resume → 403 FORBIDDEN.
 */
export const recoveryCompleteRequestSchema = z.object({
  authKey: authKeySchema,
  kdf: kdfParamsSchema,
  salt: kdfSaltSchema,
  passwordEnvelope: envelopeTextSchema,
  deviceId: z.uuid().optional(),
  deviceSecret: deviceSecretSchema.optional(),
})
export type RecoveryCompleteRequest = z.infer<typeof recoveryCompleteRequestSchema>

/**
 * B. POST /api/auth/login/recovery-key (second-factor-сессия: пароль уже проверен) — Recovery Key вместо кода.
 * Ответ — новый TOTP-секрет (totpSecretResponseSchema); сессия переходит в kind 'totp-reset'.
 * Неверный ключ → 401 INVALID_CREDENTIALS (считается попыткой сессии, как неверный код).
 */
export const loginRecoveryKeyRequestSchema = z.object({ recoveryAuthKey: authKeySchema })

/**
 * B. POST /api/auth/login/totp-reset (totp-reset-сессия) — первый код новой 2FA → sessionResponseSchema.
 * Старая 2FA заменяется, все остальные сессии и «Запомнить компьютер» сбрасываются, отложенное восстановление
 * снимается. remember — как при обычном входе.
 */
export const loginTotpResetRequestSchema = codeRequestSchema

/** POST /api/account/recovery/cancel (полная сессия, без тела) — отменить отложенное восстановление → ok */

// ---------- прочее ----------

/**
 * everywhere — завершить все сессии и снять «Запомнить этот компьютер» со всех устройств;
 * forgetDevice — снять «Запомнить» только с этого устройства (выход со стиранием данных)
 */
export const logoutRequestSchema = z
  .object({ everywhere: z.boolean().optional(), forgetDevice: z.boolean().optional() })
  .optional()

export const okResponseSchema = z.object({ ok: z.literal(true) })
