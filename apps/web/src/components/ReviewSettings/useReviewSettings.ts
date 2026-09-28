import {
  IMPACT_SCORE_MAX,
  IMPACT_SCORE_MIN,
  REPORT_LOCALES,
  REPORT_STRINGS,
  type ReportLocale,
  type ReviewGrouping,
} from '@impact-log/core'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { HIGHLIGHT_CHOICES, type ReviewPreferences } from '@/utils/reviewPreferences'

export type ReviewSettingsProps = {
  preferences: ReviewPreferences
  title: string
  reportLocale: ReportLocale
}

export type ReviewSettingsEmits = {
  'update:preferences': [value: ReviewPreferences]
  'update:title': [value: string]
  'update:reportLocale': [value: ReportLocale]
}

type Emit = {
  (event: 'update:preferences', value: ReviewPreferences): void
  (event: 'update:title', value: string): void
  (event: 'update:reportLocale', value: ReportLocale): void
}

const GROUPINGS: readonly ReviewGrouping[] = ['category', 'month', 'none']
const INCLUDES = ['includeDescriptions', 'includeMetrics', 'includeEvidence'] as const

export function useReviewSettings(props: ReviewSettingsProps, emit: Emit) {
  const { t } = useI18n()

  function patch(next: Partial<ReviewPreferences>) {
    emit('update:preferences', { ...props.preferences, ...next })
  }

  const groupOptions = computed(() =>
    GROUPINGS.map((value) => ({ value, label: t(`review.settings.group.${value}`) })),
  )

  const scoreOptions = computed(() => {
    const options = []
    for (let score = IMPACT_SCORE_MIN; score <= IMPACT_SCORE_MAX; score++) {
      options.push({
        value: String(score),
        label:
          score === IMPACT_SCORE_MIN
            ? t('review.settings.minScoreAll')
            : t('review.settings.minScoreFrom', { score, label: t(`impacts.score.${score}`) }),
      })
    }
    return options
  })

  const highlightOptions = computed(() =>
    HIGHLIGHT_CHOICES.map((value) => ({
      value: String(value),
      label: value === 0 ? t('review.settings.highlightsNone') : String(value),
    })),
  )

  const localeOptions = REPORT_LOCALES.map((value) => ({
    value,
    label: value === 'ru' ? 'Русский' : 'English',
  }))

  const titlePlaceholder = computed(() => REPORT_STRINGS[props.reportLocale].title)

  function onGroup(value: string | number) {
    if (GROUPINGS.includes(value as ReviewGrouping)) patch({ groupBy: value as ReviewGrouping })
  }

  function onMinScore(value: string) {
    patch({ minScore: Number(value) })
  }

  function onHighlights(value: string) {
    patch({ highlights: Number(value) })
  }

  function onInclude(key: (typeof INCLUDES)[number], value: boolean) {
    patch({ [key]: value })
  }

  function onLocale(value: string | number) {
    if ((REPORT_LOCALES as readonly string[]).includes(String(value))) {
      emit('update:reportLocale', value as ReportLocale)
    }
  }

  return {
    t,
    includes: INCLUDES,
    groupOptions,
    scoreOptions,
    highlightOptions,
    localeOptions,
    titlePlaceholder,
    onGroup,
    onMinScore,
    onHighlights,
    onInclude,
    onLocale,
  }
}
