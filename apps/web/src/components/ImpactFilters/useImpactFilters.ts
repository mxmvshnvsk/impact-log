import { IMPACT_SCORE_MAX, PERIOD_PRESETS } from '@impact-log/core'
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { activeFilterCount, EMPTY_FILTERS, type JournalFilters } from '@/utils/journalFilters'

export type ImpactFiltersProps = {
  filters: JournalFilters
  vocabulary: { categories: readonly string[]; labels: readonly string[] }
  total: number
  found: number
}

type Emit = (event: 'update:filters', value: JournalFilters) => void

/** Опции списка + текущее значение, даже если его уже нет в словаре (пришло из URL) */
function withCurrent(values: readonly string[], current: readonly string[]): string[] {
  const missing = current.filter((value) => !values.includes(value))
  return [...missing, ...values]
}

export function useImpactFilters(props: ImpactFiltersProps, emit: Emit) {
  const { t } = useI18n()
  const panelId = useId()
  const searchRef = ref<HTMLInputElement | null>(null)
  const open = ref(false)

  const count = computed(() => activeFilterCount(props.filters))
  const filtering = computed(() => count.value > 0 || props.filters.q.trim() !== '')

  function update(patch: Partial<JournalFilters>) {
    emit('update:filters', { ...props.filters, ...patch })
  }

  const periodOptions = computed(() =>
    [...PERIOD_PRESETS].map((preset) => ({
      value: preset,
      label: t(`dashboard.filters.period.${preset}`),
    })),
  )

  const scoreOptions = computed(() => [
    { value: '0', label: t('dashboard.filters.score.any') },
    ...[2, 3, 4].map((score) => ({
      value: String(score),
      label: t('dashboard.filters.score.from', { score }),
    })),
    { value: String(IMPACT_SCORE_MAX), label: t('dashboard.filters.score.only', { score: 5 }) },
  ])

  const categoryOptions = computed(() => [
    { value: '', label: t('dashboard.filters.category.all') },
    ...withCurrent(props.vocabulary.categories, props.filters.categories).map((value) => ({
      value,
      label: value,
    })),
  ])

  const labelOptions = computed(() => [
    { value: '', label: t('dashboard.filters.label.all') },
    ...withCurrent(props.vocabulary.labels, props.filters.labels).map((value) => ({
      value,
      label: `#${value}`,
    })),
  ])

  /** Активные категории/метки чипами — видно, что отфильтровано, и можно снять по одной */
  const activeChips = computed(() => [
    ...props.filters.categories.map((value) => ({
      key: `c:${value}`,
      text: value,
      accent: true,
      remove: () => update({ categories: props.filters.categories.filter((c) => c !== value) }),
    })),
    ...props.filters.labels.map((value) => ({
      key: `l:${value}`,
      text: `#${value}`,
      accent: false,
      remove: () => update({ labels: props.filters.labels.filter((l) => l !== value) }),
    })),
  ])

  function onSearch(event: Event) {
    update({ q: (event.target as HTMLInputElement).value })
  }

  function onSearchKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && props.filters.q) {
      event.preventDefault()
      update({ q: '' })
    }
  }

  function reset() {
    emit('update:filters', { ...EMPTY_FILTERS })
    searchRef.value?.focus()
  }

  function focusSearch() {
    searchRef.value?.focus()
    searchRef.value?.select()
  }

  return {
    t,
    panelId,
    searchRef,
    open,
    count,
    filtering,
    periodOptions,
    scoreOptions,
    categoryOptions,
    labelOptions,
    activeChips,
    update,
    onSearch,
    onSearchKeydown,
    reset,
    focusSearch,
  }
}
