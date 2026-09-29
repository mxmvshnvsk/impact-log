import { apiErrorSchema, type ErrorCode } from '@impact-log/shared'
import type { ZodType } from 'zod'

/** Коды ошибок на клиенте: коды API + ошибки, которые возникают до/без ответа сервера */
export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN_ERROR'

export class ApiError extends Error {
  readonly status: number
  readonly code: ClientErrorCode
  /** Подробности из тела ошибки (например, availableAt у RECOVERY_NOT_READY) — не проверены схемой */
  readonly details: unknown

  constructor(status: number, code: ClientErrorCode, details?: unknown) {
    super(code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/**
 * Запрос к API. Ответ проверяется zod-схемой — компоненты получают уже типизированные данные.
 */
export async function request<T>(
  path: string,
  schema: ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')

  let response: Response
  try {
    response = await fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR')
  }

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body)
    if (!parsed.success) throw new ApiError(response.status, 'UNKNOWN_ERROR')
    throw new ApiError(response.status, parsed.data.error.code, parsed.data.error.details)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(response.status, 'UNKNOWN_ERROR')
  }
  return parsed.data
}

/** POST с JSON-телом (API принимает изменяющие запросы только как application/json) */
export function post<T>(
  path: string,
  schema: ZodType<T>,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  return request(path, schema, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
