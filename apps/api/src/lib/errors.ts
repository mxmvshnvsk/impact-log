import type { ErrorCode } from '@impact-log/shared'

/**
 * Ожидаемая ошибка бизнес-логики → HTTP-ответ с кодом (текст — на фронте).
 * details — необязательные несекретные подробности для клиента (например, availableAt у RECOVERY_NOT_READY)
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly statusCode: number
  readonly details: unknown

  constructor(code: ErrorCode, statusCode: number, details?: unknown) {
    super(code)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}
