/** Экспоненциальная задержка повтора после сетевой ошибки / 5xx: 2 с, 4 с, 8 с … до 5 минут, ±20% */
export const BACKOFF_BASE_MS = 2_000
export const BACKOFF_MAX_MS = 5 * 60_000

export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const exponent = Math.max(0, Math.min(attempt - 1, 20))
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** exponent)
  return Math.min(BACKOFF_MAX_MS, Math.round(base * (0.8 + 0.4 * random())))
}
