import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSync } from '@/composables/useSync'
import { useOnline } from '@/pwa'

/**
 * Плашка «нет сети»: приложение local-first, так что офлайн — не ошибка, а спокойное уведомление.
 * Про синхронизацию упоминаем, только если она включена (есть аккаунт).
 */
export function usePwaOfflineBanner() {
  const { t } = useI18n()
  const online = useOnline()
  const sync = useSync()

  return {
    offline: computed(() => !online.value),
    message: computed(() =>
      sync.status.value === 'off' ? t('pwa.offline.local') : t('pwa.offline.sync'),
    ),
  }
}
