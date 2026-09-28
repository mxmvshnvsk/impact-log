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

export const userSchema = z.object({
  id: z.uuid(),
  /** Непрозрачный публичный ID аккаунта (12 символов Crockford Base32), не кодирует регион */
  accountId: z.string(),
  login: z.string(),
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
/** @deprecated совместимость имён */
export const meResponseSchema = sessionResponseSchema
export type MeResponse = SessionResponse

// ---------- prelogin ----------

/** POST /api/auth/prelogin — соль и KDF. Для несуществующих логинов — детерминированная «фальшивая» соль */
export const preloginRequestSchema = z.object({ login: loginSchema })
export const preloginResponseSchema = z.object({ kdf: kdfParamsSchema, salt: kdfSaltSchema })
export type PreloginResponse = z.infer<typeof preloginResponseSchema>

// ---------- регистрация (включение синхронизации для локального хранилища) ----------

/**
 * POST /api/auth/register — шаг 1: логин, authKey, параметры KDF и оба конверта MK.
 * Ответ — TOTP для приложения; аккаунт станет активным после подтверждения кода.
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

export const registerStartResponseSchema = z.object({
  otpauthUri: z.string(),
  secret: z.string(),
})
export type RegisterStartResponse = z.infer<typeof registerStartResponseSchema>

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

// ---------- восстановление доступа по Recovery Key ----------

/**
 * POST /api/auth/recovery/begin — доказать владение Recovery Key (recoveryAuthKey выводится из него
 * на клиенте). Ответ — конверт MK под Recovery Key и короткая recovery-сессия.
 * Recovery Key заменяет и пароль, и второй фактор: это единственный «аварийный комплект».
 */
export const recoveryBeginRequestSchema = z.object({
  login: loginSchema,
  recoveryAuthKey: authKeySchema,
})
export const recoveryBeginResponseSchema = z.object({ recoveryEnvelope: envelopeTextSchema })

/**
 * POST /api/auth/recovery/complete (recovery-сессия) — новый пароль: новый authKey, KDF, соль и конверт.
 * Все остальные сессии и доверенные устройства сбрасываются. Ответ — sessionResponseSchema.
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

// ---------- прочее ----------

/**
 * everywhere — завершить все сессии и снять «Запомнить этот компьютер» со всех устройств;
 * forgetDevice — снять «Запомнить» только с этого устройства (выход со стиранием данных)
 */
export const logoutRequestSchema = z
  .object({ everywhere: z.boolean().optional(), forgetDevice: z.boolean().optional() })
  .optional()

export const okResponseSchema = z.object({ ok: z.literal(true) })
