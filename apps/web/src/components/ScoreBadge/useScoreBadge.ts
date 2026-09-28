import { HIGH_IMPACT_SCORE, IMPACT_SCORE_MAX, IMPACT_SCORE_MIN } from '@impact-log/core'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

export function useScoreBadge(props: { score: number }) {
  const { t } = useI18n()
  const value = computed(() =>
    Math.min(IMPACT_SCORE_MAX, Math.max(IMPACT_SCORE_MIN, Math.round(props.score))),
  )
  const label = computed(() => t(`impacts.score.${value.value}`))
  const ariaLabel = computed(() =>
    t('impacts.scoreBadge', { score: value.value, max: IMPACT_SCORE_MAX, label: label.value }),
  )
  return {
    value,
    max: IMPACT_SCORE_MAX,
    high: computed(() => value.value >= HIGH_IMPACT_SCORE),
    label,
    ariaLabel,
  }
}
