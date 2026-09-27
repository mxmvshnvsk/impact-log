import { z } from 'zod'

/*
 * Сообщения об ошибках валидации — ключи i18n (validation.<key>), а не тексты.
 * Одни и те же схемы проверяют формы на фронте и тела запросов на бэке.
 */

export const LOGIN_MIN = 3
export const LOGIN_MAX = 32
export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 128
export const TOTP_DIGITS = 6
export const RECOVERY_CODES_COUNT = 10

export const loginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(LOGIN_MIN, 'login.tooShort')
  .max(LOGIN_MAX, 'login.tooLong')
  .regex(/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/, 'login.format')

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, 'password.tooShort')
  .max(PASSWORD_MAX, 'password.tooLong')

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${TOTP_DIGITS}}$`), 'code.format')

/** Резервный код: 12 символов, допускается ввод с дефисами и в любом регистре */
export const recoveryCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replaceAll('-', '').replaceAll(' ', ''))
  .pipe(z.string().regex(/^[a-z0-9]{12}$/, 'recoveryCode.format'))

// ---------- запросы / ответы ----------

export const credentialsSchema = z.object({
  login: loginSchema,
  password: passwordSchema,
})
export type Credentials = z.infer<typeof credentialsSchema>

/** Вход: пароль проверяем только на непустоту — правила длины могли смениться после регистрации */
export const loginRequestSchema = z.object({
  login: loginSchema,
  password: z.string().min(1, 'password.required').max(PASSWORD_MAX, 'password.tooLong'),
})
export type LoginRequest = z.infer<typeof loginRequestSchema>

export const registerStartResponseSchema = z.object({
  otpauthUri: z.string(),
  secret: z.string(),
})
export type RegisterStartResponse = z.infer<typeof registerStartResponseSchema>

export const codeRequestSchema = z.object({ code: totpCodeSchema })
export type CodeRequest = z.infer<typeof codeRequestSchema>

/** remember — «Запомнить этот компьютер»: сессия на 30 дней и вход без кода с этого устройства */
export const secondFactorRequestSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('totp'),
    code: totpCodeSchema,
    remember: z.boolean().default(false),
  }),
  z.object({
    method: z.literal('recovery'),
    code: recoveryCodeSchema,
    remember: z.boolean().default(false),
  }),
])
export type SecondFactorRequest = z.input<typeof secondFactorRequestSchema>

export const userSchema = z.object({
  id: z.string(),
  login: z.string(),
  plan: z.string(),
  createdAt: z.string(),
})
export type User = z.infer<typeof userSchema>

export const meResponseSchema = z.object({ user: userSchema })
export type MeResponse = z.infer<typeof meResponseSchema>

export const registerConfirmResponseSchema = z.object({
  user: userSchema,
  recoveryCodes: z.array(z.string()),
})
export type RegisterConfirmResponse = z.infer<typeof registerConfirmResponseSchema>

/** Вход: нужен второй фактор — или устройство доверенное, и вход уже выполнен */
export const loginResponseSchema = z.discriminatedUnion('next', [
  z.object({ next: z.literal('second-factor') }),
  z.object({ next: z.literal('done'), user: userSchema }),
])
export type LoginResponse = z.infer<typeof loginResponseSchema>

export const okResponseSchema = z.object({ ok: z.literal(true) })
