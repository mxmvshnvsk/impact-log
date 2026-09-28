import { useI18n } from 'vue-i18n'
import { useVault } from '@/composables/useVault'

export function usePublicLayout() {
  const { t } = useI18n()
  const { hasVault: isAuthenticated } = useVault()
  return { t, isAuthenticated }
}
