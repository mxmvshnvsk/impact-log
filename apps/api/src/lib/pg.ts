/**
 * Имя ограничения, если ошибка — нарушение уникальности (23505), иначе null.
 * Drizzle заворачивает ошибку postgres.js в DrizzleQueryError, поэтому идём по цепочке cause.
 */
export function uniqueViolation(error: unknown): string | null {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    const { code, constraint_name } = current as { code?: unknown; constraint_name?: unknown }
    if (code === '23505') return typeof constraint_name === 'string' ? constraint_name : ''
    current = (current as { cause?: unknown }).cause
  }
  return null
}
