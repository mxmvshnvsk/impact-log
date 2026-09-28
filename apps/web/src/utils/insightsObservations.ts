import {
  addDays,
  average,
  filterByPeriod,
  type Impact,
  type Period,
  type PeriodComparison,
  round,
  type TimelineBucket,
  timeline,
} from '@impact-log/core'
import { periodLength } from './periodSelection'

/**
 * «Наблюдения» на экране инсайтов — простые детерминированные факты о периоде: только арифметика
 * по записям, никаких догадок и LLM. Текст собирает i18n (`insights.observations.<key>`),
 * здесь — только ключ и значения.
 */
export type ObservationValue =
  | { kind: 'text'; value: string }
  | { kind: 'entries'; value: number }
  | { kind: 'weeks'; value: number }
  | { kind: 'percent'; value: number }
  | { kind: 'score'; value: number }
  | { kind: 'range'; from: string; to: string }
  | { kind: 'week'; start: string }
  | { kind: 'month'; start: string }

export type ObservationKey =
  | 'countUp'
  | 'countDown'
  | 'countSame'
  | 'topCategory'
  | 'strongestCategory'
  | 'quietStretch'
  | 'metricsUp'
  | 'metricsDown'
  | 'evidenceUp'
  | 'evidenceDown'
  | 'scoreUp'
  | 'scoreDown'
  | 'peakWeek'
  | 'peakMonth'
  | 'topLabel'
  | 'metricsTip'

export type ObservationTone = 'up' | 'down' | 'neutral' | 'tip'

export type Observation = {
  key: ObservationKey
  tone: ObservationTone
  params: Record<string, ObservationValue>
}

export type ObservationInput = {
  /** Все записи (для недельной разбивки внутри периода) */
  impacts: readonly Impact[]
  period: Period
  comparison: PeriodComparison
  buckets: readonly TimelineBucket[]
  granularity: 'week' | 'month'
}

/** Сравнивать с прошлым периодом имеет смысл, только если там было хоть что-то */
const MIN_PREVIOUS = 3
/** Порог заметного изменения доли, п.п. */
const SHARE_THRESHOLD = 10
/** Порог заметного изменения средней оценки */
const SCORE_THRESHOLD = 0.3
/** Порог заметного изменения числа записей, % */
const COUNT_THRESHOLD = 10
/** Минимум записей в категории, чтобы сравнивать её среднюю оценку */
const CATEGORY_MIN = 3
/** Минимальная «тихая» серия недель, о которой стоит сказать */
const QUIET_MIN_WEEKS = 3
/** Ниже этой доли записей с метриками — подсказка добавить цифры */
const METRICS_TIP_SHARE = 40
export const MAX_OBSERVATIONS = 6

function countChange({ comparison }: ObservationInput): Observation | null {
  const { current, previous, countChange: change } = comparison
  if (previous.total < MIN_PREVIOUS || current.total === 0 || change === null) return null
  const params = {
    change: { kind: 'percent', value: Math.abs(change) },
    current: { kind: 'entries', value: current.total },
    previous: { kind: 'entries', value: previous.total },
  } satisfies Observation['params']
  if (Math.abs(change) < COUNT_THRESHOLD) return { key: 'countSame', tone: 'neutral', params }
  return change > 0
    ? { key: 'countUp', tone: 'up', params }
    : { key: 'countDown', tone: 'down', params }
}

function topCategory({ comparison }: ObservationInput): Observation | null {
  const top = comparison.current.categories[0]
  if (!top) return null
  return {
    key: 'topCategory',
    tone: 'neutral',
    params: {
      name: { kind: 'text', value: top.name },
      count: { kind: 'entries', value: top.count },
      share: { kind: 'percent', value: top.share },
    },
  }
}

function strongestCategory({ impacts, period, comparison }: ObservationInput): Observation | null {
  const { current } = comparison
  if (current.averageScore === null) return null
  const scores = new Map<string, number[]>()
  for (const impact of filterByPeriod(impacts, period)) {
    for (const category of impact.categories) {
      scores.set(category, [...(scores.get(category) ?? []), impact.impactScore])
    }
  }
  const candidates = [...scores.entries()]
    .filter(([, values]) => values.length >= CATEGORY_MIN)
    .map(([name, values]) => ({ name, count: values.length, avg: average(values) ?? 0 }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count || a.name.localeCompare(b.name))
  const best = candidates[0]
  if (candidates.length < 2 || !best) return null
  if (best.name === current.categories[0]?.name) return null
  if (best.avg - current.averageScore < SCORE_THRESHOLD) return null
  return {
    key: 'strongestCategory',
    tone: 'neutral',
    params: {
      name: { kind: 'text', value: best.name },
      score: { kind: 'score', value: best.avg },
      overall: { kind: 'score', value: current.averageScore },
    },
  }
}

/** Самая ранняя дата записи во всём хранилище (или null) */
function earliestOccurredAt(impacts: readonly Impact[]): string | null {
  let earliest: string | null = null
  for (const impact of impacts) {
    if (earliest === null || impact.occurredAt < earliest) earliest = impact.occurredAt
  }
  return earliest
}

/**
 * Самая длинная серия полных недель без записей внутри периода. Недели до самой ранней записи
 * в хранилище не считаются: тогда журнала ещё не было, и «N недель без записей» — неправда.
 */
function quietStretch({ impacts, period, comparison }: ObservationInput): Observation | null {
  if (comparison.current.total === 0 || periodLength(period) < 6 * 7) return null
  const earliest = earliestOccurredAt(impacts)
  if (earliest === null) return null
  const weeks = timeline(impacts, period, 'week').filter(
    (bucket) =>
      bucket.start >= period.from &&
      addDays(bucket.start, 6) <= period.to &&
      addDays(bucket.start, 6) >= earliest,
  )
  let best: { start: string; end: string; length: number } | null = null
  let run: { start: string; length: number } | null = null
  for (const week of weeks) {
    if (week.count > 0) {
      run = null
      continue
    }
    run = run ? { start: run.start, length: run.length + 1 } : { start: week.start, length: 1 }
    if (!best || run.length > best.length) {
      best = { start: run.start, end: addDays(week.start, 6), length: run.length }
    }
  }
  if (!best || best.length < QUIET_MIN_WEEKS) return null
  return {
    key: 'quietStretch',
    tone: 'neutral',
    params: {
      weeks: { kind: 'weeks', value: best.length },
      range: { kind: 'range', from: best.start, to: best.end },
    },
  }
}

function shareChange(
  input: ObservationInput,
  field: 'withMetricsShare' | 'withEvidenceShare',
  keys: ['metricsUp' | 'evidenceUp', 'metricsDown' | 'evidenceDown'],
): Observation | null {
  const { current, previous } = input.comparison
  if (previous.total < MIN_PREVIOUS || current.total === 0) return null
  const delta = current[field] - previous[field]
  if (Math.abs(delta) < SHARE_THRESHOLD) return null
  return {
    key: delta > 0 ? keys[0] : keys[1],
    tone: delta > 0 ? 'up' : 'down',
    params: {
      from: { kind: 'percent', value: previous[field] },
      to: { kind: 'percent', value: current[field] },
    },
  }
}

function scoreChange({ comparison }: ObservationInput): Observation | null {
  const { current, previous, averageScoreDelta } = comparison
  if (previous.total < MIN_PREVIOUS || averageScoreDelta === null) return null
  if (current.averageScore === null || previous.averageScore === null) return null
  if (Math.abs(averageScoreDelta) < SCORE_THRESHOLD) return null
  return {
    key: averageScoreDelta > 0 ? 'scoreUp' : 'scoreDown',
    tone: averageScoreDelta > 0 ? 'up' : 'down',
    params: {
      from: { kind: 'score', value: round(previous.averageScore, 1) },
      to: { kind: 'score', value: round(current.averageScore, 1) },
    },
  }
}

function peakBucket({ buckets, granularity }: ObservationInput): Observation | null {
  if (buckets.length < 3) return null
  // «Самая насыщенная» имеет смысл, только если есть с чем сравнить: записи хотя бы в двух корзинах
  if (buckets.filter((bucket) => bucket.count > 0).length < 2) return null
  let peak: TimelineBucket | null = null
  // при равенстве — более свежая корзина
  for (const bucket of buckets) if (!peak || bucket.count >= peak.count) peak = bucket
  if (!peak || peak.count < 2) return null
  return granularity === 'week'
    ? {
        key: 'peakWeek',
        tone: 'neutral',
        params: {
          bucket: { kind: 'week', start: peak.start },
          count: { kind: 'entries', value: peak.count },
        },
      }
    : {
        key: 'peakMonth',
        tone: 'neutral',
        params: {
          bucket: { kind: 'month', start: peak.start },
          count: { kind: 'entries', value: peak.count },
        },
      }
}

function topLabel({ comparison }: ObservationInput): Observation | null {
  const top = comparison.current.labels[0]
  if (!top || top.count < 3) return null
  return {
    key: 'topLabel',
    tone: 'neutral',
    params: {
      name: { kind: 'text', value: top.name },
      count: { kind: 'entries', value: top.count },
    },
  }
}

function metricsTip({ comparison }: ObservationInput): Observation | null {
  const { current } = comparison
  if (current.total < 5 || current.withMetricsShare >= METRICS_TIP_SHARE) return null
  return {
    key: 'metricsTip',
    tone: 'tip',
    params: { share: { kind: 'percent', value: current.withMetricsShare } },
  }
}

/** Порядок — приоритет: сначала динамика и структура вклада, в конце — подсказка */
const RULES: ((input: ObservationInput) => Observation | null)[] = [
  countChange,
  topCategory,
  strongestCategory,
  quietStretch,
  (input) => shareChange(input, 'withMetricsShare', ['metricsUp', 'metricsDown']),
  scoreChange,
  (input) => shareChange(input, 'withEvidenceShare', ['evidenceUp', 'evidenceDown']),
  peakBucket,
  topLabel,
]

export function buildObservations(input: ObservationInput): Observation[] {
  const facts = RULES.map((rule) => rule(input)).filter((o): o is Observation => o !== null)
  const tip = metricsTip(input)
  const limit = tip ? MAX_OBSERVATIONS - 1 : MAX_OBSERVATIONS
  return [...facts.slice(0, limit), ...(tip ? [tip] : [])]
}
