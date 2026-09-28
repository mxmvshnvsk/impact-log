import { type Evidence, IMPACT_SCORE_MAX, type Impact } from '@impact-log/core'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useDeletedImpact } from '@/composables/useDeletedImpact'
import { useImpacts } from '@/composables/useImpacts'
import { useSync } from '@/composables/useSync'
import { formatLongDate, formatTimestamp, formatWeekday } from '@/utils/dates'
import { evidencePrimary, safeHref, shortUrl } from '@/utils/evidence'
import { EMPTY_FILTERS, filtersToQuery } from '@/utils/journalFilters'
import { isPlainShortcut } from '@/utils/keyboard'
import { formatNumber, formatSigned, metricChange } from '@/utils/numbers'

/** Просмотр записи: всё, что в ней есть, + переход к соседним, дублирование, удаление */
export function useImpactView() {
  const { t, locale } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const { list: impacts, ready, get } = useImpacts()
  const { removeWithUndo } = useDeletedImpact()
  const { conflictIds } = useSync()

  const deleteOpen = ref(false)
  const deleting = ref(false)

  const id = computed(() => String(route.params.id ?? ''))
  const impact = computed(() => get(id.value))
  /** Неразрешённый конфликт версий: разрешается в настройках аккаунта (ConflictsPanel, якорь #conflicts) */
  const conflict = computed(() => conflictIds.value.has(id.value))
  const conflictRoute = { name: 'settings-account' as const, hash: '#conflicts' }

  /** Соседи в порядке ленты: newer — выше в журнале, older — ниже */
  const neighbors = computed(() => {
    const index = impacts.value.findIndex((item) => item.objectId === id.value)
    if (index === -1) return { newer: null, older: null }
    return {
      newer: impacts.value[index - 1] ?? null,
      older: impacts.value[index + 1] ?? null,
    }
  })

  const date = computed(() => {
    const current = impact.value
    if (!current) return null
    return {
      long: formatLongDate(current.occurredAt, locale.value),
      weekday: formatWeekday(current.occurredAt, locale.value),
    }
  })

  const journalLink = (patch: { categories?: string[]; labels?: string[] }) => ({
    name: 'dashboard' as const,
    query: filtersToQuery({ ...EMPTY_FILTERS, ...patch }),
  })

  const categories = computed(() =>
    (impact.value?.categories ?? []).map((value) => ({
      value,
      to: journalLink({ categories: [value] }),
    })),
  )
  const labels = computed(() =>
    (impact.value?.labels ?? []).map((value) => ({ value, to: journalLink({ labels: [value] }) })),
  )

  const metrics = computed(() =>
    (impact.value?.metrics ?? []).map((metric) => {
      const unit = metric.unit ?? ''
      const change = metricChange(metric)
      return {
        label: metric.label,
        baseline:
          metric.baseline === undefined ? null : formatNumber(metric.baseline, locale.value),
        value: formatNumber(metric.value, locale.value),
        unit,
        delta: change
          ? `${formatSigned(change.delta, locale.value)}${unit ? ` ${unit}` : ''}`
          : null,
        percent:
          change?.percent === null || change === null
            ? null
            : `${formatSigned(change.percent, locale.value)}%`,
        down: change ? change.delta < 0 : false,
      }
    }),
  )

  const evidence = computed(() =>
    (impact.value?.evidence ?? []).map((item: Evidence, index) => ({
      key: index,
      kind: item.kind,
      primary:
        item.kind === 'text'
          ? (item.title ?? null)
          : !item.title && item.ref && item.kind !== 'url'
            ? `${t(`impacts.evidence.kinds.${item.kind}`)} ${item.ref}`
            : evidencePrimary(item),
      ref: item.title && item.ref ? item.ref : null,
      href: safeHref(item.url),
      url: shortUrl(item.url),
      excerpt: item.excerpt ?? null,
    })),
  )

  const meta = computed(() => {
    const current = impact.value
    if (!current) return null
    return {
      created: formatTimestamp(current.createdAt, locale.value),
      updated:
        current.updatedAt !== current.createdAt
          ? formatTimestamp(current.updatedAt, locale.value)
          : null,
    }
  })

  const editRoute = computed(() => ({ name: 'impact-edit' as const, params: { id: id.value } }))
  const duplicateRoute = computed(() => ({
    name: 'impact-new' as const,
    query: { duplicate: id.value },
  }))
  const impactRoute = (target: Impact | null) =>
    target ? { name: 'impact' as const, params: { id: target.objectId } } : undefined

  async function confirmDelete() {
    const current = impact.value
    if (!current) return
    deleting.value = true
    try {
      await removeWithUndo(current)
      deleteOpen.value = false
      await router.replace({ name: 'dashboard' })
    } finally {
      deleting.value = false
    }
  }

  // e — редактировать, ←/→ (или j/k) — соседние записи
  function onKeydown(event: KeyboardEvent) {
    if (!impact.value || !isPlainShortcut(event)) return
    const go = (target: Impact | null) => {
      const to = impactRoute(target)
      if (!to) return
      event.preventDefault()
      void router.replace(to)
    }
    if (event.code === 'KeyE') {
      event.preventDefault()
      void router.push(editRoute.value)
    } else if (event.key === 'ArrowLeft' || event.code === 'KeyK') go(neighbors.value.newer)
    else if (event.key === 'ArrowRight' || event.code === 'KeyJ') go(neighbors.value.older)
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

  return {
    t,
    ready,
    impact,
    date,
    categories,
    labels,
    metrics,
    evidence,
    meta,
    neighbors,
    editRoute,
    duplicateRoute,
    impactRoute,
    scoreMax: IMPACT_SCORE_MAX,
    deleteOpen,
    deleting,
    confirmDelete,
    conflict,
    conflictRoute,
  }
}
