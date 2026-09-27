import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useSession } from '@/composables/useSession'
import { initial } from '@/utils/strings'

export function useUserMenu() {
  const { t } = useI18n()
  const router = useRouter()
  const session = useSession()

  const avatar = computed(() => initial(session.user.value?.login ?? ''))

  async function logout() {
    await session.logout()
    await router.replace({ name: 'landing' })
  }

  return { t, user: session.user, avatar, logout }
}
