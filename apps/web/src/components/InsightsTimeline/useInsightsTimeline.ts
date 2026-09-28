import { addDays, type Period, startOfMonth, type TimelineBucket } from '@impact-log/core'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ColumnDatum } from '@/components/ChartColumns'
import type { ChartTable } from '@/components/ChartFrame'
import type { ScoreDatum } from '@/components/ChartScoreLine'
import { useLocale } from '@/composables/useLocale'
import {
  formatDayNumeric,
  formatDayShort,
  formatMonth,
  formatMonthShort,
  formatScore,
  formatWeek,
  plural,
} from '@/utils/insightsFormat'

export type InsightsTimelineProps = {
  buckets: readonly TimelineBucket[]
  granularity: 'week' | 'month'
  period: Period
  total: number
  averageScore: number | null
}

function bucketEnd(start: string, granularity: 'week' | 'month'): string {
  return granularity === 'week' ? addDays(start, 6) : addDays(startOfMonth(addDays(start, 32)), -1)
}

export function useInsightsTimeline(props: InsightsTimelineProps) {
  const { t } = useI18n()
  const { locale } = useLocale()
  /** Общая подсветка для обоих графиков: навели на неделю — видно и количество, и оценку */
  const active = ref<number | null>(null)

  const entries = (count: number) => plural(t, locale.value, 'insights.units.entries', count)

  const rows = computed(() =>
    props.buckets.map((bucket, index) => {
      const week = props.granularity === 'week'
      const end = bucketEnd(bucket.start, props.granularity)
      const partial = bucket.start < props.period.from || end > props.period.to
      const label = week
        ? formatWeek(locale.value, bucket.start)
        : formatMonth(locale.value, bucket.start)
      const month = bucket.start.slice(5, 7)
      const monthLabel = formatMonthShort(locale.value, bucket.start)
      const withYear = index === 0 || month === '01'
      const axisLabel = week
        ? formatDayShort(locale.value, bucket.start)
        : withYear
          ? `${monthLabel} ’${bucket.start.slice(2, 4)}`
          : monthLabel
      const score =
        bucket.averageScore === null
          ? t('insights.timeline.noScore')
          : t('insights.timeline.scoreValue', {
              score: formatScore(locale.value, bucket.averageScore),
            })
      const partialNote = partial ? t(`insights.timeline.partial.${props.granularity}`) : null
      return {
        bucket,
        label,
        axisLabel,
        compactLabel: week ? formatDayNumeric(locale.value, bucket.start) : monthLabel,
        partial,
        score,
        partialNote,
      }
    }),
  )

  const columns = computed<ColumnDatum[]>(() =>
    rows.value.map((row) => ({
      key: row.bucket.start,
      value: row.bucket.count,
      axisLabel: row.axisLabel,
      compactLabel: row.compactLabel,
      partial: row.partial,
      tooltip: [
        entries(row.bucket.count),
        row.label,
        row.score,
        ...(row.partialNote ? [row.partialNote] : []),
      ],
    })),
  )

  const scores = computed<ScoreDatum[]>(() =>
    rows.value.map((row) => ({
      key: row.bucket.start,
      value: row.bucket.averageScore,
      tooltip: [row.score, row.label, entries(row.bucket.count)],
    })),
  )

  const hasPartial = computed(() => rows.value.some((row) => row.partial))

  const peak = computed(() => {
    let best: (typeof rows.value)[number] | null = null
    for (const row of rows.value) if (!best || row.bucket.count >= best.bucket.count) best = row
    return best && best.bucket.count > 0 ? best : null
  })

  const unit = computed(() => t(`insights.timeline.by.${props.granularity}`))

  const subtitle = computed(() => `${unit.value} · ${entries(props.total)}`)

  const description = computed(() =>
    peak.value
      ? t('insights.timeline.desc', {
          unit: unit.value,
          total: entries(props.total),
          peak: entries(peak.value.bucket.count),
          when: peak.value.label,
        })
      : t('insights.timeline.descEmpty'),
  )

  const averageText = computed(() =>
    props.averageScore === null
      ? ''
      : t('insights.timeline.average', { score: formatScore(locale.value, props.averageScore) }),
  )

  const scoreDescription = computed(() =>
    t('insights.timeline.scoreDesc', { unit: unit.value, average: averageText.value }),
  )

  const table = computed<ChartTable>(() => ({
    columns: [
      t(`insights.timeline.column.${props.granularity}`),
      t('insights.timeline.column.count'),
      t('insights.timeline.column.average'),
    ],
    rows: rows.value.map((row) => ({
      key: row.bucket.start,
      cells: [
        row.partialNote ? `${row.label} (${row.partialNote})` : row.label,
        String(row.bucket.count),
        row.bucket.averageScore === null ? '—' : formatScore(locale.value, row.bucket.averageScore),
      ],
    })),
  }))

  return {
    t,
    active,
    columns,
    scores,
    hasPartial,
    subtitle,
    description,
    averageText,
    scoreDescription,
    table,
  }
}
