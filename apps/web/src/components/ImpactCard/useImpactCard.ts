import { HIGH_IMPACT_SCORE, type Impact } from '@impact-log/core'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatShortDate } from '@/utils/dates'
import { formatNumber, formatSigned, metricChange } from '@/utils/numbers'

const MAX_CHIPS = 4
const MAX_METRICS = 2
const MAX_EVIDENCE_ICONS = 3

export function useImpactCard(props: { impact: Impact }) {
  const { t, locale } = useI18n()

  const date = computed(() => formatShortDate(props.impact.occurredAt, locale.value))

  /** Категории (акцентные) и метки (#) — первые несколько, остальное «+N» */
  const chips = computed(() => {
    const all = [
      ...props.impact.categories.map((name) => ({ key: `c:${name}`, text: name, accent: true })),
      ...props.impact.labels.map((name) => ({ key: `l:${name}`, text: `#${name}`, accent: false })),
    ]
    return { visible: all.slice(0, MAX_CHIPS), rest: Math.max(0, all.length - MAX_CHIPS) }
  })

  /** 1–2 ключевые метрики: «Сборка · 6 → 2 мин · −66,7 %» */
  const metrics = computed(() =>
    (props.impact.metrics ?? []).slice(0, MAX_METRICS).map((metric) => {
      const unit = metric.unit ? ` ${metric.unit}` : ''
      const value =
        metric.baseline === undefined
          ? `${formatNumber(metric.value, locale.value)}${unit}`
          : `${formatNumber(metric.baseline, locale.value)} → ${formatNumber(metric.value, locale.value)}${unit}`
      const change = metricChange(metric)
      const delta = !change
        ? null
        : change.percent !== null
          ? `${formatSigned(change.percent, locale.value)}%`
          : `${formatSigned(change.delta, locale.value)}${unit}`
      return {
        label: metric.label,
        value,
        delta,
        down: change ? change.delta < 0 : false,
      }
    }),
  )

  const evidence = computed(() => {
    const items = props.impact.evidence ?? []
    const kinds = [...new Set(items.map((item) => item.kind))].slice(0, MAX_EVIDENCE_ICONS)
    return { count: items.length, kinds }
  })

  return {
    t,
    date,
    chips,
    metrics,
    evidence,
    high: computed(() => props.impact.impactScore >= HIGH_IMPACT_SCORE),
  }
}
