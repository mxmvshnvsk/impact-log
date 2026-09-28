import { IMPACT_SCORE_MAX, IMPACT_SCORE_MIN, type Impact } from '../domain/impact'
import { average, percent, round } from './math'
import { addDays, inPeriod, type Period, previousPeriod, startOfMonth, startOfWeek } from './period'

/** Порог «высокого влияния» */
export const HIGH_IMPACT_SCORE = 4

export type CountShare = { name: string; count: number; share: number }

export type ImpactSummary = {
  total: number
  averageScore: number | null
  highImpactCount: number
  highImpactShare: number
  withMetricsShare: number
  withEvidenceShare: number
  scoreDistribution: { score: number; count: number; share: number }[]
  categories: CountShare[]
  labels: CountShare[]
}

export function filterByPeriod(impacts: readonly Impact[], period: Period): Impact[] {
  return impacts.filter((impact) => inPeriod(impact.occurredAt, period))
}

/** Частоты с долями; сортировка: по убыванию count, затем по имени */
function frequencies(values: readonly string[], total: number): CountShare[] {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, share: percent(count, total) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export function summarize(impacts: readonly Impact[]): ImpactSummary {
  const total = impacts.length
  const highImpactCount = impacts.filter((i) => i.impactScore >= HIGH_IMPACT_SCORE).length
  const scoreDistribution = []
  for (let score = IMPACT_SCORE_MIN; score <= IMPACT_SCORE_MAX; score++) {
    const count = impacts.filter((i) => i.impactScore === score).length
    scoreDistribution.push({ score, count, share: percent(count, total) })
  }
  return {
    total,
    averageScore: average(impacts.map((i) => i.impactScore)),
    highImpactCount,
    highImpactShare: percent(highImpactCount, total),
    withMetricsShare: percent(impacts.filter((i) => i.metrics?.length).length, total),
    withEvidenceShare: percent(impacts.filter((i) => i.evidence?.length).length, total),
    scoreDistribution,
    // доля категории/метки — от числа записей (у записи может быть несколько категорий)
    categories: frequencies(
      impacts.flatMap((i) => i.categories),
      total,
    ),
    labels: frequencies(
      impacts.flatMap((i) => i.labels),
      total,
    ),
  }
}

export type TimelineBucket = {
  start: string
  count: number
  averageScore: number | null
  scoreSum: number
}

/** Разбивка по неделям/месяцам с пустыми корзинами — для графика активности */
export function timeline(
  impacts: readonly Impact[],
  period: Period,
  granularity: 'week' | 'month',
): TimelineBucket[] {
  const keyOf = granularity === 'week' ? startOfWeek : startOfMonth
  const buckets = new Map<string, Impact[]>()
  let cursor = keyOf(period.from)
  const last = keyOf(period.to)
  while (cursor <= last) {
    buckets.set(cursor, [])
    cursor = granularity === 'week' ? addDays(cursor, 7) : startOfMonth(addDays(cursor, 32))
  }
  for (const impact of filterByPeriod(impacts, period)) {
    buckets.get(keyOf(impact.occurredAt))?.push(impact)
  }
  return [...buckets.entries()].map(([start, items]) => ({
    start,
    count: items.length,
    scoreSum: items.reduce((s, i) => s + i.impactScore, 0),
    averageScore: average(items.map((i) => i.impactScore)),
  }))
}

/** Сколько недель подряд (включая текущую или прошлую) есть хотя бы одна запись */
export function weeklyStreak(impacts: readonly Impact[], today: string): number {
  const weeks = new Set(impacts.map((i) => startOfWeek(i.occurredAt)))
  let week = startOfWeek(today)
  // текущая неделя ещё не закончилась — серия не прерывается, если запись была на прошлой
  if (!weeks.has(week)) week = addDays(week, -7)
  let streak = 0
  while (weeks.has(week)) {
    streak++
    week = addDays(week, -7)
  }
  return streak
}

export type PeriodComparison = {
  current: ImpactSummary
  previous: ImpactSummary
  countDelta: number
  countChange: number | null
  averageScoreDelta: number | null
}

export function comparePeriods(impacts: readonly Impact[], period: Period): PeriodComparison {
  const current = summarize(filterByPeriod(impacts, period))
  const previous = summarize(filterByPeriod(impacts, previousPeriod(period)))
  const countDelta = current.total - previous.total
  return {
    current,
    previous,
    countDelta,
    countChange: previous.total === 0 ? null : percent(countDelta, previous.total),
    averageScoreDelta:
      current.averageScore === null || previous.averageScore === null
        ? null
        : round(current.averageScore - previous.averageScore, 2),
  }
}

/** Самая ранняя дата события (для пресета «всё время») */
export function earliestDate(impacts: readonly Impact[]): string | undefined {
  let min: string | undefined
  for (const impact of impacts) if (!min || impact.occurredAt < min) min = impact.occurredAt
  return min
}
