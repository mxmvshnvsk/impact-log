/**
 * Логирование ошибок без утечек (pino `serializers.err` + `hooks.logMethod`).
 *
 * Ошибки БД опасны для логов: DrizzleQueryError несёт в message/stack текст запроса и его параметры
 * (хеши authKey, конверты, токены сессий, шифротексты), а PostgresError — значения в detail/message.
 * Поэтому для ошибок БД пишем только имя, код SQLSTATE, имя ограничения и кадры стека (без текста
 * сообщения). Остальные ошибки — имя, сообщение, стек и причину (с теми же правилами).
 * pino без явного msg берёт его из err.message — это закрывает sanitizeLogArgs.
 */
const DB_ERROR_NAMES = new Set(['DrizzleQueryError', 'PostgresError'])
const DB_ERROR_MESSAGE = 'database error (query, parameters and details are not logged)'
const MAX_CAUSE_DEPTH = 5

type Chain = {
  name?: unknown
  code?: unknown
  constraint_name?: unknown
  cause?: unknown
  query?: unknown
  params?: unknown
}

function* causeChain(error: unknown) {
  let current: unknown = error
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current && typeof current === 'object'; depth++) {
    yield current as Chain
    current = (current as Chain).cause
  }
}

/** Имя класса ошибки: у DrizzleQueryError name не задан (== 'Error'), а имя конструктора — есть */
function errorType(error: object): string {
  const ctor = (error as { constructor?: { name?: unknown } }).constructor?.name
  if (typeof ctor === 'string' && ctor !== '' && ctor !== 'Error' && ctor !== 'Object') return ctor
  const { name } = error as { name?: unknown }
  return typeof name === 'string' ? name : 'Error'
}

function isDbError(error: unknown): boolean {
  for (const link of causeChain(error)) {
    if (DB_ERROR_NAMES.has(errorType(link))) return true
    // Форма DrizzleQueryError: текст запроса и параметры прямо в ошибке
    if ('query' in link && 'params' in link) return true
  }
  return false
}

/** Только строки «at …» — первая строка стека повторяет message */
function stackFrames(stack: unknown): string | undefined {
  if (typeof stack !== 'string') return undefined
  const frames = stack.split('\n').filter((line) => /^\s+at /.test(line))
  return frames.length > 0 ? frames.join('\n') : undefined
}

/** Форма, которую ждёт pino от serializers.err */
export type SerializedError = {
  [key: string]: unknown
  type: string
  message: string
  stack: string
}

export function serializeError(error: unknown, depth = 0): SerializedError {
  if (!(error instanceof Error)) return { type: typeof error, message: '', stack: '' }

  if (isDbError(error)) {
    let code: unknown
    let constraint: unknown
    for (const link of causeChain(error)) {
      if (code === undefined && typeof link.code === 'string') code = link.code
      if (constraint === undefined && typeof link.constraint_name === 'string') {
        constraint = link.constraint_name
      }
    }
    return {
      type: errorType(error),
      message: DB_ERROR_MESSAGE,
      code,
      constraint,
      stack: stackFrames(error.stack) ?? '',
    }
  }

  const result: SerializedError = {
    type: errorType(error),
    message: error.message,
    stack: error.stack ?? '',
  }
  const { code, statusCode } = error as { code?: unknown; statusCode?: unknown }
  if (typeof code === 'string') result.code = code
  if (typeof statusCode === 'number') result.statusCode = statusCode
  if (error.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    result.cause = serializeError(error.cause, depth + 1)
  }
  return result
}

/**
 * Аргументы вызова логгера: если логируется ошибка БД без своего сообщения (или сообщение повторяет
 * err.message), pino подставил бы err.message с SQL и параметрами в msg — заменяем на нейтральное.
 */
export function sanitizeLogArgs(args: unknown[]): unknown[] {
  const [first, second] = args
  const err =
    first instanceof Error
      ? first
      : first && typeof first === 'object' && (first as { err?: unknown }).err instanceof Error
        ? ((first as { err: Error }).err as Error)
        : null
  if (!err || !isDbError(err)) return args
  const message =
    typeof second === 'string' && !second.includes(err.message) ? second : DB_ERROR_MESSAGE
  return [first, message]
}
