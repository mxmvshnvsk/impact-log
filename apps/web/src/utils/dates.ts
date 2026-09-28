/*
 * Даты записей — «календарные» (YYYY-MM-DD, без времени), поэтому форматируем их в UTC:
 * так дата не съезжает на день из-за часового пояса. Форматтеры Intl кешируются — лента на 1000 карточек.
 */
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let cached = formatters.get(key)
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, options)
    formatters.set(key, cached)
  }
  return cached
}

function utcDate(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`)
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1)
}

/** «12 сент.» (текущий год) или «12 сент. 2024» */
export function formatShortDate(isoDate: string, locale: string, today = new Date()): string {
  const sameYear = isoDate.slice(0, 4) === String(today.getFullYear())
  return formatter(locale, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  })
    .format(utcDate(isoDate))
    .replace(/(\d{4})\s?г\.$/, '$1')
}

/** «12 сентября 2026» */
export function formatLongDate(isoDate: string, locale: string): string {
  return formatter(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(utcDate(isoDate))
    .replace(/(\d{4})\s?г\.$/, '$1')
}

/** День недели: «пятница» */
export function formatWeekday(isoDate: string, locale: string): string {
  return formatter(locale, { weekday: 'long', timeZone: 'UTC' }).format(utcDate(isoDate))
}

/** Заголовок месяца ленты: «Сентябрь 2026» (именительный падеж — standalone month) */
export function formatMonthTitle(monthKey: string, locale: string): string {
  const date = utcDate(`${monthKey}-01`)
  const month = formatter(locale, { month: 'long', timeZone: 'UTC' }).format(date)
  return `${capitalize(month)} ${monthKey.slice(0, 4)}`
}

/** Момент (ISO timestamp) в локальном времени: «28 сент. 2026, 14:03» */
export function formatTimestamp(isoTimestamp: string, locale: string): string {
  return formatter(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoTimestamp))
}
