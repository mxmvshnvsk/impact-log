import { useI18n } from 'vue-i18n'
import { useSession } from '@/composables/useSession'

export function usePublicLayout() {
  const { t } = useI18n()
  const { isAuthenticated } = useSession()
  return { t, isAuthenticated }
}
