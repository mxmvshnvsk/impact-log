import { filterImpacts, type Impact, todayIso, vocabulary } from '@impact-log/core'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { type RouteLocationRaw, useRoute, useRouter } from 'vue-router'
import { useDeletedImpact } from '@/composables/useDeletedImpact'
import { useEntitlements } from '@/composables/useEntitlements'
import { useImpacts } from '@/composables/useImpacts'
import { useMascot } from '@/composables/useMascot'
import { useVault } from '@/composables/useVault'
import {
  filtersFromQuery,
  filtersToQuery,
  isFiltering,
  type JournalFilters,
  toImpactFilter,
} from '@/utils/journalFilters'
import { isPlainShortcut } from '@/utils/keyboard'

const SEARCH_URL_DELAY_MS = 300
const TOP_VOCABULARY = 8

/**
 * Журнал: быстрый ввод, статистика, поиск/фильтры (состояние — в query URL) и лента по месяцам.
 * Записи — только из useImpacts(); фильтрация и группировка — computed, без тяжёлых вотчеров.
 */
export function useDashboardView() {
  const { t } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const { list: impacts, ready, undecryptable, count } = useImpacts()
  const { maxActiveImpacts } = useEntitlements()
  const { account } = useVault()
  const { lastDeleted, restore, dismiss } = useDeletedImpact()
  const mascot = reactive(useMascot())
  const filtersRef = ref<{ focusSearch: () => void } | null>(null)

  /* ---------- фильтры ⇄ URL ---------- */

  const filters = ref<JournalFilters>(filtersFromQuery(route.query))
  let lastPushed = JSON.stringify(filtersToQuery(filters.value))
  let urlTimer: ReturnType<typeof setTimeout> | undefined

  function pushToUrl() {
    clearTimeout(urlTimer)
    const query = filtersToQuery(filters.value)
    lastPushed = JSON.stringify(query)
    void router.replace({ query })
  }

  function setFilters(next: JournalFilters) {
    const onlySearch =
      next.q !== filters.value.q &&
      JSON.stringify({ ...next, q: '' }) === JSON.stringify({ ...filters.value, q: '' })
    filters.value = next
    // фильтры списка — сразу; строку поиска — с задержкой, чтобы не дёргать историю на каждую букву
    clearTimeout(urlTimer)
    if (onlySearch) urlTimer = setTimeout(pushToUrl, SEARCH_URL_DELAY_MS)
    else pushToUrl()
  }

  // «Назад/вперёд» или переход по ссылке-фильтру (чип метки на странице записи)
  watch(
    () => route.query,
    (query) => {
      if (route.name !== 'dashboard') return
      const next = filtersFromQuery(query)
      if (JSON.stringify(filtersToQuery(next)) === lastPushed) return
      lastPushed = JSON.stringify(filtersToQuery(next))
      filters.value = next
    },
  )

  const today = todayIso()
  const filtering = computed(() => isFiltering(filters.value))
  const filtered = computed<readonly Impact[]>(() =>
    filtering.value
      ? filterImpacts(impacts.value, toImpactFilter(filters.value, today))
      : impacts.value,
  )
  const vocab = computed(() => vocabulary(impacts.value))

  /** Частые категории/метки боковой колонки: клик включает/выключает фильтр */
  function toggleTo(kind: 'categories' | 'labels', value: string): RouteLocationRaw {
    const current = filters.value[kind]
    const next = current.includes(value) ? current.filter((v) => v !== value) : [value]
    return { name: 'dashboard', query: filtersToQuery({ ...filters.value, [kind]: next }) }
  }

  const topCategories = computed(() =>
    vocab.value.categories.slice(0, TOP_VOCABULARY).map((value) => ({
      value,
      active: filters.value.categories.includes(value),
      to: toggleTo('categories', value),
    })),
  )
  const topLabels = computed(() =>
    vocab.value.labels.slice(0, TOP_VOCABULARY).map((value) => ({
      value,
      active: filters.value.labels.includes(value),
      to: toggleTo('labels', value),
    })),
  )

  function resetFilters() {
    setFilters(filtersFromQuery({}))
  }

  /* ---------- состояние хранилища и тарифа ---------- */

  const localOnly = computed(() => account.value === null)
  const quota = computed(() =>
    maxActiveImpacts.value === null
      ? null
      : t('dashboard.quota', { n: count.value, max: maxActiveImpacts.value }),
  )

  /* ---------- маскот (виден в пустом состоянии) ---------- */

  const quickHandlers = {
    focus: () => mascot.focus('login'),
    blur: () => mascot.blur(),
    typing: (length: number) => mascot.input(length),
    created: () => mascot.react('happy'),
    failed: () => mascot.react('oops'),
  }

  /* ---------- отмена удаления ---------- */

  const restoring = ref(false)
  async function undoDelete() {
    restoring.value = true
    try {
      await restore()
    } finally {
      restoring.value = false
    }
  }

  /* ---------- горячие клавиши: n — новая запись, / — поиск ---------- */

  function onKeydown(event: KeyboardEvent) {
    if (!isPlainShortcut(event)) return
    // по физической клавише: работает и в русской раскладке
    if (event.code === 'KeyN') {
      event.preventDefault()
      void router.push({ name: 'impact-new' })
    } else if ((event.key === '/' || event.code === 'Slash') && count.value) {
      event.preventDefault()
      filtersRef.value?.focusSearch()
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    clearTimeout(urlTimer)
  })

  return {
    t,
    ready,
    count,
    undecryptable,
    filters,
    filtersRef,
    setFilters,
    resetFilters,
    filtering,
    filtered,
    vocab,
    topCategories,
    topLabels,
    impacts,
    localOnly,
    quota,
    mascot,
    quickHandlers,
    lastDeleted,
    restoring,
    undoDelete,
    dismissDeleted: dismiss,
  }
}
