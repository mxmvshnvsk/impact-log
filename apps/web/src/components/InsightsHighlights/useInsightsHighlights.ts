import type { Impact } from '@impact-log/core'
import { ChartNoAxesColumn, Lightbulb, TrendingDown, TrendingUp } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocale } from '@/composables/useLocale'
import {
  formatDate,
  formatMonth,
  formatPercent,
  formatRange,
  formatScore,
  formatWeek,
  plural,
} from '@/utils/insightsFormat'
import type { Observation, ObservationTone, ObservationValue } from '@/utils/insightsObservations'

export type InsightsHighlightsProps = {
  top: readonly Impact[]
  observations: readonly Observation[]
}

const TONE_ICON: Record<ObservationTone, typeof TrendingUp> = {
  up: TrendingUp,
  down: TrendingDown,
  neutral: ChartNoAxesColumn,
  tip: Lightbulb,
}

export function useInsightsHighlights(props: InsightsHighlightsProps) {
  const { t } = useI18n()
  const { locale } = useLocale()

  function format(value: ObservationValue): string {
    switch (value.kind) {
      case 'text':
        return value.value
      case 'entries':
        return plural(t, locale.value, 'insights.units.entries', value.value)
      case 'weeks':
        return plural(t, locale.value, 'insights.units.weeks', value.value)
      case 'percent':
        return formatPercent(locale.value, value.value)
      case 'score':
        return formatScore(locale.value, value.value)
      case 'range':
        return formatRange(locale.value, value.from, value.to)
      case 'week':
        return formatWeek(locale.value, value.start)
      case 'month':
        return formatMonth(locale.value, value.start)
    }
  }

  const facts = computed(() =>
    props.observations.map((observation) => {
      const params = Object.fromEntries(
        Object.entries(observation.params).map(([name, value]) => [name, format(value)]),
      )
      return {
        key: observation.key,
        tone: observation.tone,
        icon: TONE_ICON[observation.tone],
        text: t(`insights.observations.${observation.key}`, params),
      }
    }),
  )

  const entries = computed(() =>
    props.top.map((impact) => ({
      id: impact.objectId,
      title: impact.title,
      score: impact.impactScore,
      date: formatDate(locale.value, impact.occurredAt),
      categories: impact.categories.join(', '),
    })),
  )

  return { t, facts, entries }
}
