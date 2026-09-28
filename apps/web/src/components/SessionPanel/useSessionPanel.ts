import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorKey } from '@/account'
import { useAccount } from '@/composables/useAccount'

/** Выход: на этом устройстве (оставить или стереть записи) и «выйти везде» */
export function useSessionPanel() {
  const { t } = useI18n()
  const accountFlow = useAccount()

  const logoutOpen = ref(false)
  const logoutWipe = ref(false)

  function openLogout(wipe: boolean) {
    logoutWipe.value = wipe
    logoutOpen.value = true
  }

  const everywhereOpen = ref(false)
  const everywhereBusy = ref(false)
  const everywhereError = ref<string | null>(null)
  const everywhereDone = ref(false)

  watch(everywhereOpen, (open) => {
    if (open) everywhereError.value = null
  })

  async function confirmEverywhere() {
    if (everywhereBusy.value) return
    everywhereBusy.value = true
    try {
      await accountFlow.logoutEverywhere()
      everywhereOpen.value = false
      everywhereDone.value = true
    } catch (cause) {
      everywhereError.value = errorKey(cause)
    } finally {
      everywhereBusy.value = false
    }
  }

  return {
    t,
    logoutOpen,
    logoutWipe,
    openLogout,
    everywhereOpen,
    everywhereBusy,
    everywhereError,
    everywhereDone,
    confirmEverywhere,
  }
}
