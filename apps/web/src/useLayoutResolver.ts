import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useVault } from '@/composables/useVault'
import { AppLayout } from '@/layouts/AppLayout'
import { AuthLayout } from '@/layouts/AuthLayout'
import { PublicLayout } from '@/layouts/PublicLayout'

const LAYOUTS = { app: AppLayout, auth: AuthLayout, public: PublicLayout } as const

/** Каркас страницы выбирается по meta.layout маршрута */
export function useLayoutResolver() {
  const route = useRoute()
  const { hasVault } = useVault()

  const layout = computed(() => {
    const kind = route.meta.layout ?? 'public'
    if (kind === 'adaptive') return hasVault.value ? LAYOUTS.app : LAYOUTS.public
    return LAYOUTS[kind]
  })

  return { layout }
}
