import type { Impact } from '@impact-log/core'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSync } from '@/composables/useSync'
import { formatMonthTitle } from '@/utils/dates'

/** Сколько карточек дорисовываем за раз: лента на тысячи записей не строит весь DOM сразу */
const PAGE_SIZE = 40

export type FeedGroup = { key: string; title: string; total: number; items: Impact[] }

export function useImpactFeed(props: { impacts: readonly Impact[] }) {
  const { t, locale } = useI18n()
  const { conflictIds } = useSync()
  const limit = ref(PAGE_SIZE)
  const sentinelRef = ref<HTMLElement | null>(null)

  // новый набор (фильтр, поиск) — снова с первой страницы
  watch(
    () => props.impacts,
    () => {
      limit.value = PAGE_SIZE
    },
  )

  /** Сколько записей в каждом месяце — по всему списку, а не только по отрисованной части */
  const monthTotals = computed(() => {
    const totals = new Map<string, number>()
    for (const impact of props.impacts) {
      const key = impact.occurredAt.slice(0, 7)
      totals.set(key, (totals.get(key) ?? 0) + 1)
    }
    return totals
  })

  /** Список уже отсортирован (свежие сверху) — группируем за один проход */
  const groups = computed<FeedGroup[]>(() => {
    const result: FeedGroup[] = []
    let current = null as FeedGroup | null
    for (const impact of props.impacts.slice(0, limit.value)) {
      const key = impact.occurredAt.slice(0, 7)
      if (current?.key !== key) {
        current = {
          key,
          title: formatMonthTitle(key, locale.value),
          total: monthTotals.value.get(key) ?? 0,
          items: [],
        }
        result.push(current)
      }
      current.items.push(impact)
    }
    return result
  })

  const hasMore = computed(() => props.impacts.length > limit.value)
  const remaining = computed(() => props.impacts.length - limit.value)

  function showMore() {
    limit.value += PAGE_SIZE
  }

  // дорисовываем, когда низ ленты подъезжает к экрану
  let observer: IntersectionObserver | null = null
  watch(sentinelRef, (el) => {
    observer?.disconnect()
    if (!el || typeof IntersectionObserver === 'undefined') return
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && hasMore.value) showMore()
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(el)
  })
  onBeforeUnmount(() => observer?.disconnect())

  return { t, groups, hasMore, remaining, showMore, sentinelRef, conflictIds }
}
