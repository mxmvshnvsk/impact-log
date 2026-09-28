import { IMPACT_SCORE_MAX, IMPACT_SCORE_MIN } from '@impact-log/core'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UiSegmentedOption } from '@/ui/UiSegmented'

const SCORES = Array.from(
  { length: IMPACT_SCORE_MAX - IMPACT_SCORE_MIN + 1 },
  (_, index) => IMPACT_SCORE_MIN + index,
)

/** Варианты оценки для UiSegmented: цифра + подпись шкалы в title/aria-label */
export function useScoreOptions() {
  const { t } = useI18n()
  return computed<UiSegmentedOption[]>(() =>
    SCORES.map((score) => ({
      value: score,
      label: String(score),
      title: t(`impacts.score.${score}`),
    })),
  )
}

export function useScoreInput(props: { modelValue: number }) {
  const { t } = useI18n()
  const options = useScoreOptions()
  const caption = computed(() => t(`impacts.score.${props.modelValue}`))
  const guide = computed(() =>
    SCORES.map((score) => ({
      score,
      label: t(`impacts.score.${score}`),
      text: t(`impacts.scoreGuide.items.${score}`),
    })),
  )
  return { t, options, caption, guide }
}
