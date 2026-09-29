import { CloudAlert, CloudCheck, CloudOff, LogIn, RefreshCcwDot, RefreshCw } from 'lucide-vue-next'
import { type Component, computed, onScopeDispose, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEntitlements } from '@/composables/useEntitlements'
import { useSync } from '@/composables/useSync'
import { formatRelativeTime } from '@/sync/relativeTime'

const KNOWN_ERRORS = new Set([
  'INVALID',
  'TOO_LARGE',
  'VAULT_LOCKED',
  'RATE_LIMITED',
  'ACCOUNT_MISMATCH',
  'KEY_CHANGED',
])

/** Панель синхронизации в настройках аккаунта: статус, очередь, квота, ошибки, «Синхронизировать сейчас» */
export function useSyncPanel() {
  const { t, locale } = useI18n()
  const sync = useSync()
  const { plan, maxActiveImpacts } = useEntitlements()
  const now = ref(Date.now())
  const timer = setInterval(() => {
    now.value = Date.now()
  }, 15_000)
  onScopeDispose(() => clearInterval(timer))

  const manual = ref(false)
  const status = sync.status

  function relative(iso: string) {
    return formatRelativeTime(iso, locale.value, {
      // now.value — реактивная «минутная стрелка», Date.now() — чтобы свежая отметка не ушла «в будущее»
      now: Math.max(now.value, Date.now()),
      justNow: t('sync.relative.justNow'),
    })
  }

  /** Статус человеческим языком: «синхронизировано», но с оговоркой про конфликты / лимит */
  const statusText = computed(() => {
    if (status.value === 'idle' && sync.conflicts.value > 0) return t('sync.summary.conflicts')
    if (status.value === 'idle' && sync.quotaBlocked.value > 0) return t('sync.summary.quota')
    return t(`sync.status.${status.value}`)
  })

  const icon = computed<Component>(() => {
    switch (status.value) {
      case 'syncing':
        return RefreshCw
      case 'offline':
      case 'off':
        return CloudOff
      case 'signed-out':
        return LogIn
      case 'paused':
        return RefreshCcwDot
      case 'error':
        return CloudAlert
      default:
        return sync.conflicts.value > 0 || sync.quotaBlocked.value > 0 ? CloudAlert : CloudCheck
    }
  })

  const tone = computed(() => {
    if (status.value === 'error') return 'danger'
    if (status.value === 'signed-out') return 'warning'
    if (status.value === 'idle' && (sync.conflicts.value > 0 || sync.quotaBlocked.value > 0)) {
      return 'warning'
    }
    return status.value === 'idle' ? 'ok' : 'muted'
  })

  const lastSync = computed(() =>
    sync.lastSyncAt.value
      ? t('sync.panel.lastSync', { time: relative(sync.lastSyncAt.value) })
      : t('sync.panel.never'),
  )

  const pendingText = computed(() => t('sync.panel.pending', sync.pending.value))

  const retryText = computed(() =>
    sync.retryAt.value ? t('sync.panel.retry', { time: relative(sync.retryAt.value) }) : null,
  )

  const errorText = computed(() => {
    const code = sync.lastError.value
    if (!code) return null
    return KNOWN_ERRORS.has(code) ? t(`sync.errors.${code}`) : t('sync.errors.generic', { code })
  })

  const quota = computed(() => {
    const blocked = sync.quotaBlocked.value
    if (blocked === 0) return null
    const limit = maxActiveImpacts.value
    const usage = sync.usage.value
    return {
      text: t(
        'sync.quota.text',
        { n: blocked, plan: t(`sync.plans.${plan.value}`), limit: limit ?? '∞' },
        blocked,
      ),
      usage:
        usage && limit !== null
          ? t('sync.quota.usage', { count: usage.activeImpacts, limit })
          : null,
    }
  })

  const canSync = computed(
    () => status.value !== 'off' && status.value !== 'signed-out' && status.value !== 'paused',
  )

  async function syncNow() {
    manual.value = true
    try {
      await sync.syncNow()
    } finally {
      manual.value = false
    }
  }

  return {
    t,
    status,
    statusText,
    icon,
    tone,
    spinning: computed(() => status.value === 'syncing' || manual.value),
    lastSync,
    pendingText,
    retryText,
    errorText,
    quota,
    canSync,
    syncNow,
  }
}
