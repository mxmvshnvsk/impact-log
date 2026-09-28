import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UiTabItem } from '@/ui/UiTabs'

/** Настройки: вкладки-маршруты «Аккаунт и синхронизация» и «Данные» */
export function useSettingsView() {
  const { t } = useI18n()
  const tabs = computed<UiTabItem[]>(() => [
    {
      key: 'account',
      label: t('account.settings.tabs.account'),
      to: { name: 'settings-account' },
    },
    { key: 'data', label: t('account.settings.tabs.data'), to: { name: 'settings-data' } },
  ])
  return { t, tabs }
}
