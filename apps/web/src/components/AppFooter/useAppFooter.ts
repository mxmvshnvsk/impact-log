import { useI18n } from 'vue-i18n'

export function useAppFooter() {
  const { t } = useI18n()
  return { t, year: new Date().getFullYear() }
}
