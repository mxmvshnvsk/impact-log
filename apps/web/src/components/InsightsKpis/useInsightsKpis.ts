import type { Period, PeriodComparison } from '@impact-log/core'
import { round } from '@impact-log/core'
import {
  Award,
  CalendarCheck2,
  Flame,
  type LucideIcon,
  NotebookPen,
  Paperclip,
  Ruler,
} from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocale } from '@/composables/useLocale'
import { formatNumber, formatPercent, formatRange, formatScore } from '@/utils/insightsFormat'

export type InsightsKpisProps = {
  comparison: PeriodComparison
  previousPeriod: Period
  streak: { current: number; previous: number }
  /** false — предыдущий период целиком до первой записи: дельты не показываем */
  comparable: boolean
}

type DeltaKind = 'count' | 'score' | 'points'
type Direction = 'up' | 'down' | 'flat'

export type KpiItem = {
  key: string
  icon: LucideIcon
  value: string
  hint?: string
  delta: { direction: Direction; text: string; sr: string } | null
}

export function useInsightsKpis(props: InsightsKpisProps) {
  const { t } = useI18n()
  const { locale } = useLocale()

  function formatDelta(value: number, kind: DeltaKind): string {
    const abs = Math.abs(value)
    const sign = value > 0 ? '+' : value < 0 ? '−' : '±'
    if (kind === 'score') return `${sign}${formatScore(locale.value, abs)}`
    if (kind === 'points')
      return `${sign}${formatNumber(locale.value, Math.round(abs))} ${t('insights.kpi.points')}`
    return `${sign}${formatNumber(locale.value, abs)}`
  }

  function delta(value: number | null, kind: DeltaKind): KpiItem['delta'] {
    if (value === null || !props.comparable) return null
    const normalized =
      kind === 'score' ? round(value, 1) : kind === 'points' ? Math.round(value) : value
    const direction: Direction = normalized > 0 ? 'up' : normalized < 0 ? 'down' : 'flat'
    const text = direction === 'flat' ? t('insights.kpi.same') : formatDelta(normalized, kind)
    return {
      direction,
      text,
      sr: t(`insights.kpi.deltaSr.${direction}`, { value: formatDelta(normalized, kind) }),
    }
  }

  const previousLabel = computed(() =>
    t('insights.kpi.previous', {
      range: formatRange(locale.value, props.previousPeriod.from, props.previousPeriod.to),
    }),
  )

  const items = computed<KpiItem[]>(() => {
    const { current, previous, countDelta, averageScoreDelta } = props.comparison
    const hasPrevious = previous.total > 0
    const share = (field: 'highImpactShare' | 'withMetricsShare' | 'withEvidenceShare') =>
      hasPrevious && current.total > 0 ? delta(current[field] - previous[field], 'points') : null
    return [
      {
        key: 'total',
        icon: NotebookPen,
        value: formatNumber(locale.value, current.total),
        delta: delta(countDelta, 'count'),
      },
      {
        key: 'average',
        icon: Award,
        value:
          current.averageScore === null ? '—' : formatScore(locale.value, current.averageScore),
        hint: current.averageScore === null ? undefined : t('insights.kpi.averageHint'),
        delta: delta(averageScoreDelta, 'score'),
      },
      {
        key: 'high',
        icon: Flame,
        value: formatPercent(locale.value, current.highImpactShare),
        hint: t(
          'insights.kpi.highHint',
          { count: formatNumber(locale.value, current.highImpactCount) },
          current.highImpactCount,
        ),
        delta: share('highImpactShare'),
      },
      {
        key: 'metrics',
        icon: Ruler,
        value: formatPercent(locale.value, current.withMetricsShare),
        delta: share('withMetricsShare'),
      },
      {
        key: 'evidence',
        icon: Paperclip,
        value: formatPercent(locale.value, current.withEvidenceShare),
        delta: share('withEvidenceShare'),
      },
      {
        key: 'streak',
        icon: CalendarCheck2,
        value: formatNumber(locale.value, props.streak.current),
        hint: t('insights.kpi.streakHint'),
        delta: delta(props.streak.current - props.streak.previous, 'count'),
      },
    ]
  })

  return { t, items, previousLabel }
}
