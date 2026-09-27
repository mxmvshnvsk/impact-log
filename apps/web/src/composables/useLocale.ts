import { isLocale, type Locale, SUPPORTED_LOCALES } from '@impact-log/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { writeStoredLocale } from '@/utils/localeStorage'

export function useLocale() {
  const { locale } = useI18n({ useScope: 'global' })

  const current = computed<Locale>(() => (isLocale(locale.value) ? locale.value : 'ru'))

  function setLocale(next: Locale) {
    locale.value = next
    writeStoredLocale(next)
    document.documentElement.lang = next
  }

  return { locale: current, locales: SUPPORTED_LOCALES, setLocale }
}
