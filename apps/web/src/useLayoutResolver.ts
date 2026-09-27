import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSession } from '@/composables/useSession'
import { AppLayout } from '@/layouts/AppLayout'
import { AuthLayout } from '@/layouts/AuthLayout'
import { PublicLayout } from '@/layouts/PublicLayout'

const LAYOUTS = { app: AppLayout, auth: AuthLayout, public: PublicLayout } as const

/** Каркас страницы выбирается по meta.layout маршрута */
export function useLayoutResolver() {
  const route = useRoute()
  const { isAuthenticated } = useSession()

  const layout = computed(() => {
    const kind = route.meta.layout ?? 'public'
    if (kind === 'adaptive') return isAuthenticated.value ? LAYOUTS.app : LAYOUTS.public
    return LAYOUTS[kind]
  })

  return { layout }
}
