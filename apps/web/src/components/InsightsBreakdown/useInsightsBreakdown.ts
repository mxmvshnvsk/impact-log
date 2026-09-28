import type { CountShare } from '@impact-log/core'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BarDatum } from '@/components/ChartBars'
import type { ChartTable } from '@/components/ChartFrame'
import { useLocale } from '@/composables/useLocale'
import { formatPercent, plural } from '@/utils/insightsFormat'

export type InsightsBreakdownProps = {
  kind: 'categories' | 'labels'
  items: readonly CountShare[]
}

const TOP = { categories: 8, labels: 10 } as const

/** Топ категорий или меток: горизонтальные полосы, подпись — над полосой, значение — на конце */
export function useInsightsBreakdown(props: InsightsBreakdownProps) {
  const { t } = useI18n()
  const { locale } = useLocale()

  const name = (value: string) => (props.kind === 'labels' ? `#${value}` : value)

  const top = computed(() => props.items.slice(0, TOP[props.kind]))
  const rest = computed(() => Math.max(0, props.items.length - top.value.length))

  const bars = computed<BarDatum[]>(() =>
    top.value.map((item) => ({
      key: item.name,
      label: name(item.name),
      value: item.count,
      valueLabel: `${item.count} · ${formatPercent(locale.value, item.share)}`,
      tooltip: [
        plural(t, locale.value, 'insights.units.entries', item.count),
        t('insights.breakdown.share', { share: formatPercent(locale.value, item.share) }),
      ],
    })),
  )

  const description = computed(() =>
    top.value.map((item) => `${name(item.name)}: ${item.count}`).join('; '),
  )

  const table = computed<ChartTable>(() => ({
    columns: [
      t(`insights.breakdown.${props.kind}.column`),
      t('insights.breakdown.column.count'),
      t('insights.breakdown.column.share'),
    ],
    rows: props.items.map((item) => ({
      key: item.name,
      cells: [name(item.name), String(item.count), formatPercent(locale.value, item.share)],
    })),
  }))

  const restText = computed(() =>
    rest.value > 0
      ? plural(t, locale.value, `insights.breakdown.${props.kind}.rest`, rest.value)
      : '',
  )

  return { t, bars, description, table, restText }
}
