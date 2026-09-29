import { z } from 'zod'

/**
 * Коды ошибок, которые возвращает API. Тексты ошибок живут только на фронте (i18n: errors.<CODE>).
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  // auth
  'LOGIN_TAKEN',
  'INVALID_CREDENTIALS',
  'INVALID_CODE',
  'SESSION_EXPIRED',
  'REGISTRATION_CLOSED',
  'PAYLOAD_TOO_LARGE',
  // отложенное восстановление ещё не готово (или не начато / истекло) — 403, details.availableAt
  'RECOVERY_NOT_READY',
  // устройства
  'DEVICE_REVOKED',
  // регион
  'WRONG_REGION',
  // синхронизация: заголовок X-Impact-Account не совпадает с пользователем сессии (409)
  'ACCOUNT_MISMATCH',
  // ротация ключа (ADR-0012), все — 409
  'ROTATION_IN_PROGRESS',
  'ROTATION_INCOMPLETE',
  'NO_ROTATION',
] as const

export const errorCodeSchema = z.enum(ERROR_CODES)
export type ErrorCode = z.infer<typeof errorCodeSchema>

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    details: z.unknown().optional(),
  }),
})
export type ApiErrorBody = z.infer<typeof apiErrorSchema>
