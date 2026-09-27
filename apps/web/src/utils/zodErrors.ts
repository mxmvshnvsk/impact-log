import type { z } from 'zod'

/**
 * Первая ошибка по каждому полю верхнего уровня. Сообщения в схемах — ключи i18n (validation.<key>).
 */
export function fieldErrors(issues: readonly z.core.$ZodIssue[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const issue of issues) {
    const field = issue.path[0]
    if (typeof field === 'string' && !(field in result)) result[field] = issue.message
  }
  return result
}
