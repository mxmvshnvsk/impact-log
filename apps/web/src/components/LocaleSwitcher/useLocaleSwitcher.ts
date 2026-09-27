import { useI18n } from 'vue-i18n'
import { useLocale } from '@/composables/useLocale'

export function useLocaleSwitcher() {
  const { t } = useI18n()
  const { locale, locales, setLocale } = useLocale()

  return { t, locale, locales, setLocale }
}
