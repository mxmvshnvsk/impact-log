import { computed, onMounted, onScopeDispose, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchHealth } from '@/api/health'

export type ApiStatusState = 'loading' | 'ok' | 'degraded' | 'error'

const POLL_INTERVAL_MS = 30_000

/** Статус сервера: запрос при монтировании и далее раз в 30 секунд, пока вкладка видима */
export function useApiStatus() {
  const { t } = useI18n()
  const state = ref<ApiStatusState>('loading')
  const version = ref<string | null>(null)

  async function load() {
    try {
      const health = await fetchHealth()
      state.value = health.status
      version.value = health.version
    } catch {
      state.value = 'error'
      version.value = null
    }
  }

  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') void load()
  }, POLL_INTERVAL_MS)
  onScopeDispose(() => clearInterval(timer))
  onMounted(load)

  const label = computed(() => {
    const status = `${t('apiStatus.label')}: ${t(`apiStatus.${state.value}`)}`
    return version.value
      ? `${status} (${t('apiStatus.version', { version: version.value })})`
      : status
  })

  return { state, version, label }
}
