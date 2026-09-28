import { addDays, parseIsoDate } from '@impact-log/core'

/**
 * Форматирование чисел, дат и множественного числа для инсайтов и ревью.
 * Даты ядра — полночь UTC, поэтому и форматируем в UTC (без сдвига на часовой пояс).
 */
export type AppLocale = 'ru' | 'en'
type Translate = (key: string, params?: Record<string, unknown>) => string

const pluralRules = new Map<string, Intl.PluralRules>()

/** one / few / many / other по правилам языка (в ru: 1 запись, 2 записи, 5 записей) */
export function pluralCategory(locale: AppLocale, count: number): Intl.LDMLPluralRule {
  let rules = pluralRules.get(locale)
  if (!rules) {
    rules = new Intl.PluralRules(locale)
    pluralRules.set(locale, rules)
  }
  return rules.select(count)
}

/**
 * Строка с числом в правильной форме: ключ `<base>.one|few|many|other`, параметр `{n}`.
 * Если формы нет в словаре (en: только one/other) — берётся other.
 */
export function plural(t: Translate, locale: AppLocale, base: string, count: number): string {
  const category = pluralCategory(locale, count)
  const n = formatNumber(locale, count)
  const key = `${base}.${category}`
  const text = t(key, { n })
  return text === key ? t(`${base}.other`, { n }) : text
}

export function formatNumber(locale: AppLocale, value: number, maxDigits = 0): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: maxDigits,
    minimumFractionDigits: 0,
  }).format(value)
}

/** Оценка — всегда с одним знаком: 3,6 / 3.6 */
export function formatScore(locale: AppLocale, value: number): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value)
}

export function formatPercent(locale: AppLocale, value: number): string {
  return `${formatNumber(locale, Math.round(value))}%`
}

function utcFormat(locale: AppLocale, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })
}

/** Без «г.» после года в ru: «28 сент. 2026» */
function withoutYearSuffix(text: string): string {
  return text.replace(/(\d{4})\s?г\./g, '$1')
}

/** 12 июл. 2026 / Jul 12, 2026 */
export function formatDate(locale: AppLocale, iso: string, withYear = true): string {
  return withoutYearSuffix(
    utcFormat(locale, {
      day: 'numeric',
      month: withYear ? 'short' : 'long',
      ...(withYear ? { year: 'numeric' } : {}),
    }).format(parseIsoDate(iso)),
  )
}

/** 12 июл / Jul 12 — подписи оси */
export function formatDayShort(locale: AppLocale, iso: string): string {
  return utcFormat(locale, { day: 'numeric', month: 'short' })
    .format(parseIsoDate(iso))
    .replace('.', '')
}

/** 12.07 / 7/12 — самые компактные подписи оси */
export function formatDayNumeric(locale: AppLocale, iso: string): string {
  return utcFormat(locale, { day: 'numeric', month: 'numeric' }).format(parseIsoDate(iso))
}

/** «март 2026» / «March 2026» (без «г.») */
export function formatMonth(locale: AppLocale, iso: string, withYear = true): string {
  const month = utcFormat(locale, { month: 'long' }).format(parseIsoDate(iso))
  return withYear ? `${month} ${iso.slice(0, 4)}` : month
}

/** «мар» / «Mar» — подпись месяца на оси */
export function formatMonthShort(locale: AppLocale, iso: string): string {
  return utcFormat(locale, { month: 'short' }).format(parseIsoDate(iso)).replace('.', '')
}

/**
 * Диапазон дат без повторов: «14–20 сент. 2026», «1 июл. — 28 сент. 2026», «3 окт. 2025 — 28 сент. 2026».
 * Intl.DateTimeFormat#formatRange сам склеивает общие части с учётом языка.
 */
export function formatRange(locale: AppLocale, from: string, to: string): string {
  if (from === to) return formatDate(locale, to)
  const format = utcFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  return withoutYearSuffix(format.formatRange(parseIsoDate(from), parseIsoDate(to)))
}

/** Неделя с понедельника: «7–13 апр. 2026» */
export function formatWeek(locale: AppLocale, start: string): string {
  return formatRange(locale, start, addDays(start, 6))
}
