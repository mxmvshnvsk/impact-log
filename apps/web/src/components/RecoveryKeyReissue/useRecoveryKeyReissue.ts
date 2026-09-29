import { ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorKey, type RecoveryMaterial } from '@/account'
import { useAccount } from '@/composables/useAccount'

export type RecoveryKeyReissueProps = {
  /** authKey пароля, только что выведенный при входе/восстановлении — пароль второй раз не спрашиваем */
  currentAuthKey: string
  login: string
}

export type RecoveryKeyReissueEmits = { done: []; mood: [kind: 'happy' | 'oops'] }
type Emit = ((event: 'done') => void) & ((event: 'mood', kind: 'happy' | 'oops') => void)

type State = 'idle' | 'kit' | 'done'

/**
 * «Перевыпустите Recovery Key» после того, как им воспользовались (восстановление, вход без 2FA):
 * новый комплект создаётся в браузере и показывается ДО отправки; старый перестаёт работать,
 * только когда новый сохранён.
 */
export function useRecoveryKeyReissue(props: RecoveryKeyReissueProps, emit: Emit) {
  const { t } = useI18n()
  const accountFlow = useAccount()
  const state = ref<State>('idle')
  const busy = ref(false)
  const error = ref<string | null>(null)
  const material = shallowRef<RecoveryMaterial | null>(null)
  const kitRef = ref<{ validate: () => boolean } | null>(null)

  async function start() {
    if (busy.value) return
    busy.value = true
    error.value = null
    try {
      material.value = await accountFlow.prepareRecoveryKey()
      state.value = 'kit'
    } catch (cause) {
      error.value = errorKey(cause)
    } finally {
      busy.value = false
    }
  }

  async function submit() {
    if (busy.value || !material.value) return
    if (!kitRef.value?.validate()) return
    busy.value = true
    error.value = null
    try {
      await accountFlow.rotateRecoveryKey(material.value, { currentAuthKey: props.currentAuthKey })
      state.value = 'done'
      material.value = null
      emit('mood', 'happy')
      emit('done')
    } catch (cause) {
      error.value = errorKey(cause, 'reauth')
      emit('mood', 'oops')
    } finally {
      busy.value = false
    }
  }

  return { t, state, busy, error, material, kitRef, start, submit }
}
