import {
  type Evidence,
  evidenceFromUrl,
  IMPACT_SCORE_MAX,
  IMPACT_SCORE_MIN,
  type Metric,
  normalizeCategories,
  normalizeLabels,
} from '@impact-log/core'
import { inputError } from './errors'
import { t } from './i18n'

/** Разбор значений флагов в поля черновика. Ошибки — CliError с кодом 1 */

export function parseScore(value: string): number {
  const score = Number(value.trim())
  if (!Number.isInteger(score) || score < IMPACT_SCORE_MIN || score > IMPACT_SCORE_MAX) {
    throw inputError(t('error.score', { value }))
  }
  return score
}

export function parseDate(value: string): string {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) {
    const [, y, m, d] = match.map(Number) as [number, number, number, number]
    const date = new Date(Date.UTC(y, m - 1, d))
    if (date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) {
      return match[0]
    }
  }
  throw inputError(t('error.date', { value }))
}

const NUMBER = String.raw`[+-]?\d+(?:[.,]\d+)?`
const VALUE_RE = new RegExp(`^(${NUMBER})\\s*(.*)$`)

function splitNumber(text: string): { value: number; unit: string } | null {
  const match = text.trim().match(VALUE_RE)
  if (!match?.[1]) return null
  const value = Number(match[1].replace(',', '.'))
  return Number.isFinite(value) ? { value, unit: (match[2] ?? '').trim() } : null
}

/**
 * «Label=value unit» или «Label=before->after unit» (стрелка «->» или «→»).
 * Единица может быть указана у обоих чисел («12 min -> 4 min») или только у последнего.
 */
export function parseMetric(spec: string): Metric {
  const eq = spec.indexOf('=')
  const label = spec.slice(0, eq).trim()
  const rest = spec.slice(eq + 1)
  const fail = () => inputError(t('error.metric', { value: spec }))
  if (eq <= 0 || !label || label.length > 80) throw fail()
  const parts = rest.split(/->|→/)
  let metric: Metric
  if (parts.length === 1) {
    const current = splitNumber(rest)
    if (!current) throw fail()
    metric = { label, value: current.value, ...(current.unit ? { unit: current.unit } : {}) }
  } else if (parts.length === 2) {
    const before = splitNumber(parts[0] ?? '')
    const after = splitNumber(parts[1] ?? '')
    if (!before || !after) throw fail()
    const unit = after.unit || before.unit
    metric = { label, value: after.value, baseline: before.value, ...(unit ? { unit } : {}) }
  } else {
    throw fail()
  }
  if ((metric.unit?.length ?? 0) > 20) throw fail()
  return metric
}

export function parseLink(value: string): Evidence {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw inputError(t('error.link', { value }))
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw inputError(t('error.link', { value }))
  }
  return evidenceFromUrl(url.href)
}

/** -c можно повторять и перечислять через запятую; регистр сохраняется */
export function parseCategories(values: readonly string[] = []): string[] {
  return normalizeCategories(values.flatMap((value) => value.split(',')))
}

/** -l можно повторять и перечислять через запятую; нормализация ядра: «CI tools» → «ci-tools» */
export function parseLabels(values: readonly string[] = []): string[] {
  return normalizeLabels(values.flatMap((value) => value.split(',')))
}

/** Обрезка до max UTF-16 символов (так считает zod) с «…», не разрывая суррогатные пары */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  let cut = max - 1
  const code = text.charCodeAt(cut - 1)
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1
  return `${text.slice(0, cut).trimEnd()}…`
}
