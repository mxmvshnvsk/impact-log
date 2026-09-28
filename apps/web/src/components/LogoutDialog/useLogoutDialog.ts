import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { errorKey } from '@/account'
import { useAccount } from '@/composables/useAccount'
import { useSync } from '@/composables/useSync'
import { noBreak } from '@/utils/strings'

export type LogoutDialogEmits = { close: []; done: [wiped: boolean] }

type Emit = ((event: 'close') => void) & ((event: 'done', wiped: boolean) => void)

/**
 * Выход на этом устройстве: оставить записи (хранилище станет локальным) или стереть их из браузера.
 * Перед стиранием предупреждаем о неотправленных изменениях.
 */
export function useLogoutDialog(props: { open: boolean; initialWipe?: boolean }, emit: Emit) {
  const { t } = useI18n()
  const router = useRouter()
  const accountFlow = useAccount()
  const sync = useSync()

  const wipe = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)

  watch(
    () => props.open,
    (open) => {
      if (!open) return
      wipe.value = props.initialWipe ?? false
      error.value = null
    },
  )

  async function confirm() {
    if (busy.value) return
    busy.value = true
    error.value = null
    const wiped = wipe.value
    try {
      await accountFlow.logout({ wipe: wiped })
      emit('done', wiped)
      emit('close')
      if (wiped) await router.replace({ name: 'landing' })
    } catch (cause) {
      error.value = errorKey(cause)
    } finally {
      busy.value = false
    }
  }

  function close() {
    if (!busy.value) emit('close')
  }

  return {
    t,
    /** Для заголовка: логин не переносится по дефису */
    login: computed(() => noBreak(accountFlow.account.value?.login ?? '')),
    wipe,
    busy,
    error,
    pending: sync.pending,
    confirm,
    close,
  }
}
