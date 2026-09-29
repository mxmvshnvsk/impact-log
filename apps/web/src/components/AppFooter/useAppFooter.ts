import { useI18n } from 'vue-i18n'
import { CLIENT_LINKS, SOURCE_URL } from '@/constants/links'

export function useAppFooter() {
  const { t } = useI18n()
  return {
    t,
    year: new Date().getFullYear(),
    sourceUrl: SOURCE_URL,
    clientLinks: CLIENT_LINKS,
  }
}
