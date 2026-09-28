import { useI18n } from 'vue-i18n'
import { usePwaUpdate } from '@/pwa'

/**
 * Тост «Доступна новая версия»: страницу перезагружаем только по кнопке (в форме могут быть
 * несохранённые изменения — тогда сработает её beforeunload). «Позже» — скрыть до следующей версии.
 */
export function usePwaUpdateToast() {
  const { t } = useI18n()
  const { available, applying, apply, dismiss } = usePwaUpdate()
  return { t, available, applying, apply, dismiss }
}
