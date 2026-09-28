import type { Impact } from '@impact-log/core'
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { type ConflictView, type ResolveChoice, useSync } from '@/composables/useSync'
import { ConflictResolutionError } from '@/sync'
import { formatRelativeTime } from '@/sync/relativeTime'
import { formatLongDate } from '@/utils/dates'
import { prefersReducedMotion } from '@/utils/motion'

/** Якорь панели: ссылки «Выбрать версию» из журнала и с экрана записи ведут на /settings/account#conflicts */
export const ANCHOR = 'conflicts'

/** Поля, которые показываем всегда; остальные — если различаются или заполнены хотя бы в одной версии */
const BASE_FIELDS = ['title', 'occurredAt', 'impactScore']
const OPTIONAL_FIELDS = [
  'description',
  'categories',
  'labels',
  'metrics',
  'evidence',
  'attachments',
]
const DESCRIPTION_PREVIEW = 280

export type ConflictField = {
  key: string
  label: string
  diff: boolean
  text: string
  score: number | null
}

export type ConflictSideView = {
  key: 'local' | 'server'
  caption: string
  changed: string | null
  note: string | null
  fields: ConflictField[]
}

export type ConflictAction = {
  id: string
  choice: ResolveChoice
  label: string
  variant: 'secondary' | 'danger'
  /** Разрушительное действие — сначала подтверждение */
  confirm: boolean
}

export type ConflictItem = {
  objectId: string
  sides: ConflictSideView[]
  actions: ConflictAction[]
}

export function useConflictsPanel() {
  const { t, locale } = useI18n()
  const sync = useSync()
  const views = shallowRef<ConflictView[]>([])
  const busy = ref<string | null>(null)
  const confirming = ref<string | null>(null)
  const error = ref<string | null>(null)
  const route = useRoute()
  const titleRef = ref<HTMLElement | null>(null)
  /** По ссылке с якорем прокручиваем к панели один раз — список появляется асинхронно */
  let revealed = false

  async function reveal() {
    if (revealed || route.hash !== `#${ANCHOR}` || views.value.length === 0) return
    revealed = true
    await nextTick()
    document.getElementById(ANCHOR)?.scrollIntoView({
      block: 'start',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
    titleRef.value?.focus({ preventScroll: true })
  }

  async function load() {
    try {
      views.value = await sync.listConflicts()
    } catch (reason) {
      console.warn('[sync] cannot list conflicts', reason)
    }
    await reveal()
  }

  onMounted(load)
  watch([sync.conflicts, sync.lastSyncAt], () => void load())
  watch(
    () => route.hash,
    () => {
      revealed = false
      void reveal()
    },
  )

  function text(impact: Impact, key: string): string {
    const empty = t('sync.conflicts.empty')
    switch (key) {
      case 'title':
        return impact.title
      case 'occurredAt':
        return formatLongDate(impact.occurredAt, locale.value)
      case 'description': {
        const value = impact.description?.trim() ?? ''
        if (!value) return empty
        return value.length > DESCRIPTION_PREVIEW
          ? `${value.slice(0, DESCRIPTION_PREVIEW)}…`
          : value
      }
      case 'categories':
      case 'labels': {
        const list = key === 'categories' ? impact.categories : impact.labels
        return list.length ? list.join(', ') : empty
      }
      default: {
        const value = (impact as Record<string, unknown>)[key]
        return Array.isArray(value) ? String(value.length) : empty
      }
    }
  }

  function filled(impact: Impact | null, key: string): boolean {
    const value = impact ? (impact as Record<string, unknown>)[key] : undefined
    if (Array.isArray(value)) return value.length > 0
    return typeof value === 'string' ? value.trim().length > 0 : value !== undefined
  }

  /** Одинаковый набор строк в обеих колонках — чтобы версии читались построчно */
  function keysOf(view: ConflictView): string[] {
    const optional = OPTIONAL_FIELDS.filter(
      (key) =>
        view.diff.includes(key) ||
        filled(view.local.impact, key) ||
        filled(view.server.impact, key),
    )
    return [...BASE_FIELDS, ...optional]
  }

  function fieldsOf(
    impact: Impact,
    keys: readonly string[],
    diff: readonly string[],
  ): ConflictField[] {
    return keys.map((key) => ({
      key,
      label: t(`sync.conflicts.fields.${key}`),
      diff: diff.includes(key),
      text: key === 'impactScore' ? String(impact.impactScore) : text(impact, key),
      score: key === 'impactScore' ? impact.impactScore : null,
    }))
  }

  function sideOf(view: ConflictView, key: 'local' | 'server'): ConflictSideView {
    const side = view[key]
    const updatedAt = side.impact?.updatedAt ?? (key === 'local' ? view.local.updatedAt : null)
    const note = side.deleted
      ? t(key === 'local' ? 'sync.conflicts.deletedLocal' : 'sync.conflicts.deletedServer')
      : side.undecryptable
        ? t('sync.conflicts.undecryptable')
        : null
    return {
      key,
      caption: t(`sync.conflicts.${key}`),
      changed:
        updatedAt && !side.deleted
          ? t('sync.conflicts.changed', {
              time: formatRelativeTime(updatedAt, locale.value, {
                justNow: t('sync.relative.justNow'),
              }),
            })
          : null,
      note,
      fields: side.impact && !note ? fieldsOf(side.impact, keysOf(view), view.diff) : [],
    }
  }

  function actionsOf(view: ConflictView): ConflictAction[] {
    const action = (
      choice: ResolveChoice,
      label: string,
      variant: ConflictAction['variant'] = 'secondary',
    ): ConflictAction => ({
      id: `${view.objectId}:${choice}`,
      choice,
      label: t(`sync.conflicts.${label}`),
      variant,
      confirm: variant === 'danger',
    })
    // Удалено на другом устройстве, а здесь правили
    if (view.server.deleted) {
      return [action('local', 'restoreLocal'), action('server', 'delete', 'danger')]
    }
    // Удалено здесь, а на другом устройстве правили
    if (view.local.deleted)
      return [action('server', 'keepServer'), action('local', 'delete', 'danger')]
    const actions = [action('local', 'keepLocal'), action('server', 'keepServer')]
    if (view.canKeepBoth) actions.push(action('both', 'keepBoth'))
    return actions
  }

  const items = computed<ConflictItem[]>(() =>
    views.value.map((view) => ({
      objectId: view.objectId,
      sides: [sideOf(view, 'local'), sideOf(view, 'server')],
      actions: actionsOf(view),
    })),
  )

  async function choose(item: ConflictItem, action: ConflictAction, confirmed = false) {
    if (action.confirm && !confirmed) {
      confirming.value = action.id
      return
    }
    confirming.value = null
    busy.value = action.id
    error.value = null
    try {
      await sync.resolveConflict(item.objectId, action.choice)
      await load()
    } catch (reason) {
      error.value =
        reason instanceof ConflictResolutionError && reason.message === 'CHANGED'
          ? t('sync.conflicts.changedMeanwhile')
          : t('sync.conflicts.failed')
      console.warn('[sync] cannot resolve conflict', reason)
      await load()
    } finally {
      busy.value = null
    }
  }

  function cancelConfirm() {
    confirming.value = null
  }

  return { t, items, busy, confirming, error, choose, cancelConfirm, titleRef }
}
