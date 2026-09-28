import { HIGH_IMPACT_SCORE, type ImpactSummary } from '@impact-log/core'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BarDatum } from '@/components/ChartBars'
import type { ChartTable } from '@/components/ChartFrame'
import { useLocale } from '@/composables/useLocale'
import { formatPercent, plural } from '@/utils/insightsFormat'

/**
 * Распределение оценок 1–5. Сильные (4–5) — акцентом, остальные — нейтральным серым:
 * цвет подчёркивает долю «сильных» из KPI, а не кодирует порядок оценок.
 */
export function useInsightsScores(props: { summary: ImpactSummary }) {
  const { t } = useI18n()
  const { locale } = useLocale()

  const ordered = computed(() => [...props.summary.scoreDistribution].reverse())

  const bars = computed<BarDatum[]>(() =>
    ordered.value.map((item) => {
      const name = t(`impacts.score.${item.score}`)
      const entries = plural(t, locale.value, 'insights.units.entries', item.count)
      return {
        key: String(item.score),
        label: `${item.score} · ${name}`,
        value: item.count,
        valueLabel: `${item.count} · ${formatPercent(locale.value, item.share)}`,
        tooltip: [
          entries,
          t('insights.scores.share', { share: formatPercent(locale.value, item.share) }),
        ],
        tone: item.score >= HIGH_IMPACT_SCORE ? 'accent' : 'muted',
      }
    }),
  )

  const subtitle = computed(() =>
    t('insights.scores.subtitle', {
      share: formatPercent(locale.value, props.summary.highImpactShare),
    }),
  )

  const description = computed(() =>
    ordered.value
      .map((item) => `${item.score}: ${item.count} (${formatPercent(locale.value, item.share)})`)
      .join('; '),
  )

  const table = computed<ChartTable>(() => ({
    columns: [
      t('insights.scores.column.score'),
      t('insights.scores.column.count'),
      t('insights.scores.column.share'),
    ],
    rows: ordered.value.map((item) => ({
      key: String(item.score),
      cells: [
        `${item.score} · ${t(`impacts.score.${item.score}`)}`,
        String(item.count),
        formatPercent(locale.value, item.share),
      ],
    })),
  }))

  return { t, bars, subtitle, description, table }
}
