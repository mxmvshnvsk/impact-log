/*
 * «2 минуты назад» / «через 30 секунд» для статуса синхронизации. Старше недели — дата и время.
 */
const formatters = new Map<string, Intl.RelativeTimeFormat>()

function relative(locale: string): Intl.RelativeTimeFormat {
  let cached = formatters.get(locale)
  if (!cached) {
    cached = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    formatters.set(locale, cached)
  }
  return cached
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
]

export function formatRelativeTime(
  iso: string,
  locale: string,
  options: { now?: number; justNow: string },
): string {
  const now = options.now ?? Date.now()
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''
  let value = (time - now) / 1000
  // Отметка «только что» может обогнать часы на доли секунды — это всё ещё «только что»
  if (Math.abs(value) < 45) {
    return value <= 1 ? options.justNow : relative(locale).format(Math.round(value), 'second')
  }
  for (const [unit, size] of UNITS) {
    if (Math.abs(value) < size) return relative(locale).format(Math.round(value), unit)
    value /= size
  }
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time))
}
