import type { ErrorCode } from '@impact-log/shared'

/** Ожидаемая ошибка бизнес-логики → HTTP-ответ с кодом (текст — на фронте) */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly statusCode: number

  constructor(code: ErrorCode, statusCode: number) {
    super(code)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
  }
}
