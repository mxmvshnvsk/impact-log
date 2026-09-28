import {
  IMPACT_SCORE_MAX,
  IMPACT_SCORE_MIN,
  type ImpactFilter,
  PERIOD_PRESETS,
  type PeriodPreset,
  presetPeriod,
} from '@impact-log/core'
import type { LocationQuery, LocationQueryRaw } from 'vue-router'

/**
 * Фильтры журнала живут в query-параметрах URL: переход в запись и «назад» возвращают в ту же
 * отфильтрованную ленту, на фильтр можно сослаться (чип метки на странице записи). Смена фильтра
 * заменяет текущую запись истории, а не плодит новые. Здесь — чистые функции разбора/сборки.
 *   ?q=текст&period=quarter&cat=Платформа&label=perf&min=4
 */
export type JournalFilters = {
  q: string
  period: PeriodPreset
  categories: string[]
  labels: string[]
  /** 0 — любая оценка */
  minScore: number
}

export const EMPTY_FILTERS: JournalFilters = {
  q: '',
  period: 'all',
  categories: [],
  labels: [],
  minScore: 0,
}

function list(value: LocationQuery[string] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : []
  return values.filter((v): v is string => typeof v === 'string' && v.length > 0)
}

function single(value: LocationQuery[string] | undefined): string {
  return list(value)[0] ?? ''
}

export function filtersFromQuery(query: LocationQuery): JournalFilters {
  const period = single(query.period)
  const min = Number(single(query.min))
  return {
    q: single(query.q),
    period: (PERIOD_PRESETS as readonly string[]).includes(period)
      ? (period as PeriodPreset)
      : 'all',
    categories: list(query.cat),
    labels: list(query.label),
    minScore: Number.isInteger(min) && min > IMPACT_SCORE_MIN && min <= IMPACT_SCORE_MAX ? min : 0,
  }
}

/** Только непустые параметры — URL остаётся коротким */
export function filtersToQuery(filters: JournalFilters): LocationQueryRaw {
  const query: LocationQueryRaw = {}
  const q = filters.q.trim()
  if (q) query.q = q
  if (filters.period !== 'all') query.period = filters.period
  if (filters.categories.length) query.cat = [...filters.categories]
  if (filters.labels.length) query.label = [...filters.labels]
  if (filters.minScore) query.min = String(filters.minScore)
  return query
}

/** Сколько фильтров (кроме строки поиска) активно */
export function activeFilterCount(filters: JournalFilters): number {
  return (
    (filters.period !== 'all' ? 1 : 0) +
    filters.categories.length +
    filters.labels.length +
    (filters.minScore ? 1 : 0)
  )
}

export function isFiltering(filters: JournalFilters): boolean {
  return filters.q.trim() !== '' || activeFilterCount(filters) > 0
}

/** Фильтры журнала → фильтр ядра (период «всё время» — без ограничения) */
export function toImpactFilter(filters: JournalFilters, today: string): ImpactFilter {
  return {
    query: filters.q.trim() || undefined,
    period: filters.period === 'all' ? undefined : presetPeriod(filters.period, today),
    categories: filters.categories,
    labels: filters.labels,
    minScore: filters.minScore || undefined,
  }
}
