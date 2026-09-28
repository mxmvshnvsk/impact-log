import {
  buildReview,
  compareImpactsDesc,
  earliestDate,
  filterByPeriod,
  type Impact,
  type ReportLocale,
  type ReviewOptions,
  renderReviewMarkdown,
} from '@impact-log/core'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePeriodQuery } from '@/components/PeriodPicker'
import { useEntitlements } from '@/composables/useEntitlements'
import { useImpacts } from '@/composables/useImpacts'
import { useLocale } from '@/composables/useLocale'
import { formatRange } from '@/utils/insightsFormat'
import { localIsoDate, resolvePeriod } from '@/utils/periodSelection'
import {
  type ReviewPreferences,
  readReviewPreferences,
  writeReviewPreferences,
} from '@/utils/reviewPreferences'

export function useReviewView() {
  const { t } = useI18n()
  const { locale } = useLocale()
  const { impacts, ready } = useImpacts()
  const { can } = useEntitlements()
  // Ревью обычно раз в полгода — это и период по умолчанию
  const { selection } = usePeriodQuery('halfYear')
  const today = localIsoDate()

  const all = computed(() => impacts.value as readonly Impact[])
  const period = computed(() => resolvePeriod(selection.value, today, earliestDate(all.value)))

  const preferences = ref<ReviewPreferences>(readReviewPreferences())
  watch(preferences, writeReviewPreferences, { deep: true })

  const title = ref('')
  /** Язык отчёта: по умолчанию — язык интерфейса; не запоминается */
  const reportLocale = ref<ReportLocale>(locale.value)

  /** Ручной выбор хранится как «исключённые»: новые подходящие записи включаются сами */
  const excluded = shallowRef<ReadonlySet<string>>(new Set())

  const candidates = computed(() =>
    filterByPeriod(all.value, period.value)
      .filter((impact) => impact.impactScore >= preferences.value.minScore)
      .sort(compareImpactsDesc),
  )

  const selectedIds = computed(() =>
    excluded.value.size
      ? candidates.value.filter((i) => !excluded.value.has(i.objectId)).map((i) => i.objectId)
      : undefined,
  )

  const selectedCount = computed(() => selectedIds.value?.length ?? candidates.value.length)

  const options = computed<ReviewOptions>(() => ({
    ...preferences.value,
    period: period.value,
    locale: reportLocale.value,
    title: title.value.trim() || undefined,
    selectedIds: selectedIds.value,
  }))

  const report = computed(() => buildReview(all.value, options.value))
  const markdown = computed(() => renderReviewMarkdown(report.value))

  /** Промпт для своего AI: нейтральная инструкция + отчёт. Язык — как у отчёта */
  const prompt = computed(() => {
    const range = formatRange(reportLocale.value, period.value.from, period.value.to)
    const instruction = t('review.prompt.template', { range }, { locale: reportLocale.value })
    return `${instruction}\n\n---\n\n${markdown.value}`
  })

  const state = computed(() => {
    if (!ready.value) return 'loading'
    if (!can('reviewBuilder')) return 'locked'
    if (all.value.length === 0) return 'empty'
    return 'ready'
  })

  return {
    t,
    today,
    selection,
    period,
    preferences,
    title,
    reportLocale,
    excluded,
    candidates,
    selectedCount,
    report,
    markdown,
    prompt,
    state,
  }
}
