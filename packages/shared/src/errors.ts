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
