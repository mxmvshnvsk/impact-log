import { type Metric, metricDelta } from '@impact-log/core'

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(locale: string, signed: boolean): Intl.NumberFormat {
  const key = `${locale}|${signed}`
  let cached = formatters.get(key)
  if (!cached) {
    cached = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
      signDisplay: signed ? 'exceptZero' : 'auto',
    })
    formatters.set(key, cached)
  }
  return cached
}

/** Число с разделителями разрядов; минус — типографский */
export function formatNumber(value: number, locale: string): string {
  return formatter(locale, false).format(value).replace('-', '−')
}

/** Со знаком: «+3», «−4», «0» */
export function formatSigned(value: number, locale: string): string {
  return formatter(locale, true).format(value).replace('-', '−')
}

const BYTE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const

/** Размер по-человечески: «812 байт», «1,4 МБ», «512 МБ» (шаг 1024, как у лимитов тарифа) */
export function formatBytes(bytes: number, locale: string): string {
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: BYTE_UNITS[unit],
    // короткое «byte» в en не склоняется («963 byte») — байты пишем словом
    unitDisplay: unit === 0 ? 'long' : 'short',
    maximumFractionDigits: unit > 0 && value < 10 ? 1 : 0,
  }).format(value)
}

export type MetricChange = {
  delta: number
  /** Изменение в % от «было»; null — если «было» = 0 */
  percent: number | null
}

/** Дельта и процент изменения (null — «было» не задано) */
export function metricChange(metric: Metric): MetricChange | null {
  const delta = metricDelta(metric)
  if (delta === null || metric.baseline === undefined) return null
  const percent = metric.baseline === 0 ? null : (delta / Math.abs(metric.baseline)) * 100
  return { delta, percent: percent === null ? null : Math.round(percent * 10) / 10 }
}

/** Разбор числа из поля ввода: запятая как десятичный разделитель, пробелы-разделители разрядов */
export function parseNumberInput(value: string): number | null {
  const clean = value.trim().replace(/[\s ]/g, '').replace(',', '.').replace('−', '-')
  if (!clean) return null
  const parsed = Number(clean)
  return Number.isFinite(parsed) ? parsed : null
}
