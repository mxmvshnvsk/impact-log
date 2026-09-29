/*
 * Срок отложенного восстановления (ADR-0008 §7) для людей: дата и время по часам этого устройства
 * («чт, 1 октября в 14:30») и сколько осталось («через 47 часов» / «через 25 минут»).
 */
const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000

export type AvailableAtView = {
  /** Локальные дата и время */
  date: string
  /** «через N часов» / «через N минут»; пусто, если срок уже наступил */
  relative: string
  /** Срок наступил */
  ready: boolean
}

export function formatAvailableAt(iso: string, locale: string, now = Date.now()): AvailableAtView {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return { date: '', relative: '', ready: false }
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time))
  const left = time - now
  if (left <= 0) return { date, relative: '', ready: true }
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'always' })
  const relative =
    left >= HOUR_MS
      ? format.format(Math.round(left / HOUR_MS), 'hour')
      : format.format(Math.max(1, Math.ceil(left / MINUTE_MS)), 'minute')
  return { date, relative, ready: false }
}
