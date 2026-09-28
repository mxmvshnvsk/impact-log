import {
  daysBetween,
  PERIOD_PRESETS,
  type Period,
  type PeriodPreset,
  presetPeriod,
} from '@impact-log/core'

/**
 * Выбор периода для инсайтов и ревью: пресет ядра («последние N дней») или свой диапазон.
 * Состояние живёт в query URL (?period=quarter | ?period=custom&from=…&to=…) — ссылкой можно поделиться
 * с самим собой, «назад» в браузере работает.
 */
export type PeriodChoice = PeriodPreset | 'custom'
export type PeriodSelection =
  | { preset: PeriodPreset }
  | { preset: 'custom'; from: string; to: string }

export const PERIOD_CHOICES: readonly PeriodChoice[] = [...PERIOD_PRESETS, 'custom']

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    ISO_DATE.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  )
}

/** Сегодняшняя дата в часовом поясе пользователя (записи датируются «по-местному») */
export function localIsoDate(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function isPreset(value: unknown): value is PeriodPreset {
  return typeof value === 'string' && (PERIOD_PRESETS as readonly string[]).includes(value)
}

type QueryValue = string | null | (string | null)[] | undefined

function first(value: QueryValue): string | undefined {
  const item = Array.isArray(value) ? value[0] : value
  return item ?? undefined
}

/** Разбор query; мусор в URL не ломает экран — берётся пресет по умолчанию */
export function parsePeriodQuery(
  query: Record<string, QueryValue>,
  fallback: PeriodPreset,
): PeriodSelection {
  const preset = first(query.period)
  if (preset === 'custom') {
    const from = first(query.from)
    const to = first(query.to)
    if (isIsoDate(from) && isIsoDate(to)) {
      return from <= to ? { preset: 'custom', from, to } : { preset: 'custom', from: to, to: from }
    }
  }
  if (isPreset(preset)) return { preset }
  return { preset: fallback }
}

export function periodQuery(selection: PeriodSelection): Record<string, string> {
  return selection.preset === 'custom'
    ? { period: 'custom', from: selection.from, to: selection.to }
    : { period: selection.preset }
}

export function resolvePeriod(
  selection: PeriodSelection,
  today: string,
  earliest?: string,
): Period {
  if (selection.preset === 'custom') return { from: selection.from, to: selection.to }
  return presetPeriod(selection.preset, today, earliest)
}

export function samePeriodSelection(a: PeriodSelection, b: PeriodSelection): boolean {
  if (a.preset !== b.preset) return false
  if (a.preset === 'custom' && b.preset === 'custom') return a.from === b.from && a.to === b.to
  return true
}

/** Длина периода в днях (включительно) */
export function periodLength(period: Period): number {
  return daysBetween(period.from, period.to) + 1
}

/** До ~полугода — по неделям (≤ 27 столбцов), дальше — по месяцам */
export const WEEKLY_MAX_DAYS = 190

export function periodGranularity(period: Period): 'week' | 'month' {
  return periodLength(period) <= WEEKLY_MAX_DAYS ? 'week' : 'month'
}
