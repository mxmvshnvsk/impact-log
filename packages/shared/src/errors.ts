import { z } from 'zod'

/**
 * Коды ошибок, которые возвращает API. Тексты ошибок живут только на фронте (i18n: errors.<CODE>).
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
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
