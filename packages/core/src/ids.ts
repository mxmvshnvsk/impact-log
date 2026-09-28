/** Стабильный случайный идентификатор объекта (UUID v4) — не зависит от сервера и региона */
export function newId(): string {
  return globalThis.crypto.randomUUID()
}

/** Сегодняшняя дата в формате YYYY-MM-DD (локальная) */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
