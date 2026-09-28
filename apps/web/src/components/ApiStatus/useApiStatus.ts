import { computed, onMounted, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { fetchHealth } from '@/api/health'
import { useVault } from '@/composables/useVault'

/** idle — сервер сейчас не нужен (локальный режим), offline — браузер без сети: в обоих случаях не пингуем */
export type ApiStatusState = 'loading' | 'ok' | 'degraded' | 'error' | 'offline' | 'idle'

const POLL_INTERVAL_MS = 30_000

const isOffline = () => navigator.onLine === false

/**
 * Статус сервера в подвале. /api/health запрашивается, только если сервер действительно нужен —
 * к хранилищу привязан аккаунт синхронизации или открыт экран входа/регистрации/восстановления — и есть
 * сеть. В локальном режиме приложение работает без сервера и не обращается к нему вовсе.
 * Пока нужен: при монтировании, при возврате сети и раз в 30 секунд, пока вкладка видима.
 */
export function useApiStatus() {
  const { t } = useI18n()
  const route = useRoute()
  const vault = useVault()
  const state = ref<ApiStatusState>('idle')
  const version = ref<string | null>(null)

  const needed = computed(() => vault.account.value !== null || route.meta.layout === 'auth')

  async function load() {
    if (!needed.value) {
      state.value = 'idle'
      version.value = null
      return
    }
    if (isOffline()) {
      state.value = 'offline'
      return
    }
    if (state.value === 'idle' || state.value === 'offline') state.value = 'loading'
    try {
      const health = await fetchHealth()
      state.value = health.status
      version.value = health.version
    } catch {
      state.value = isOffline() ? 'offline' : 'error'
      version.value = null
    }
  }

  const timer = setInterval(() => {
    if (document.visibilityState === 'visible' && needed.value && !isOffline()) {
      void load()
    }
  }, POLL_INTERVAL_MS)
  const onOnline = () => void load()
  const onOffline = () => {
    if (needed.value) state.value = 'offline'
  }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  onScopeDispose(() => {
    clearInterval(timer)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  })
  onMounted(load)
  watch(needed, () => void load())

  const label = computed(() => {
    const status = `${t('apiStatus.label')}: ${t(`apiStatus.${state.value}`)}`
    return version.value
      ? `${status} (${t('apiStatus.version', { version: version.value })})`
      : status
  })

  return { state, version, label }
}
