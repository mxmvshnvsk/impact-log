import { CloudAlert, CloudCheck, CloudOff, CloudUpload, LogIn, RefreshCw } from 'lucide-vue-next'
import { type Component, computed, onScopeDispose, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSync } from '@/composables/useSync'
import { formatRelativeTime } from '@/sync/relativeTime'

export type SyncTone = 'ok' | 'busy' | 'muted' | 'warning' | 'danger'

/** Компактный статус синхронизации для шапки: иконка, тон, подпись (aria + тултип) */
export function useSyncIndicator() {
  const { t, locale } = useI18n()
  const sync = useSync()
  const now = ref(Date.now())
  const timer = setInterval(() => {
    now.value = Date.now()
  }, 30_000)
  onScopeDispose(() => clearInterval(timer))

  const attention = computed(() => sync.conflicts.value > 0 || sync.quotaBlocked.value > 0)

  const view = computed<{ icon: Component; tone: SyncTone }>(() => {
    switch (sync.status.value) {
      case 'syncing':
        return { icon: RefreshCw, tone: 'busy' }
      case 'offline':
        return { icon: CloudOff, tone: 'muted' }
      case 'signed-out':
        return { icon: LogIn, tone: 'warning' }
      case 'error':
        return { icon: CloudAlert, tone: 'danger' }
      default:
        if (attention.value) return { icon: CloudAlert, tone: 'warning' }
        if (sync.pending.value > 0) return { icon: CloudUpload, tone: 'muted' }
        return { icon: CloudCheck, tone: 'ok' }
    }
  })

  const label = computed(() => {
    const idle = sync.status.value === 'idle'
    const parts = [
      idle && sync.conflicts.value > 0
        ? t('sync.summary.conflicts')
        : idle && sync.quotaBlocked.value > 0
          ? t('sync.summary.quota')
          : t(`sync.status.${sync.status.value}`),
    ]
    if (sync.conflicts.value > 0)
      parts.push(t('sync.indicator.conflicts', { n: sync.conflicts.value }, sync.conflicts.value))
    if (sync.pending.value > 0) parts.push(t('sync.indicator.pending', { n: sync.pending.value }))
    const last = sync.lastSyncAt.value
    if (last && sync.status.value !== 'syncing') {
      const time = formatRelativeTime(last, locale.value, {
        now: Math.max(now.value, Date.now()),
        justNow: t('sync.relative.justNow'),
      })
      parts.push(t('sync.indicator.lastSync', { time }))
    }
    return parts.join(' · ')
  })

  const badge = computed(() => {
    const count = sync.conflicts.value || sync.quotaBlocked.value
    if (count > 0) return count > 9 ? '9+' : String(count)
    return null
  })

  /** Есть конфликты — сразу к панели их разрешения */
  const to = computed(() =>
    sync.conflicts.value > 0
      ? { name: 'settings-account' as const, hash: '#conflicts' }
      : { name: 'settings-account' as const },
  )

  return {
    visible: computed(() => sync.status.value !== 'off'),
    to,
    spinning: computed(() => sync.status.value === 'syncing'),
    icon: computed(() => view.value.icon),
    tone: computed(() => view.value.tone),
    label,
    badge,
  }
}
