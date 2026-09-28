import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorKey, type RecoveryMaterial } from '@/account'
import { type AccountStage, useAccount } from '@/composables/useAccount'

export type RecoveryKeyRotationEmits = { done: []; cancel: [] }
type Emit = ((event: 'done') => void) & ((event: 'cancel') => void)

/**
 * Перевыпуск Recovery Key: новый комплект создаётся в браузере и показывается ДО отправки —
 * старый ключ перестанет работать только после того, как новый сохранён и подтверждён паролем.
 */
export function useRecoveryKeyRotation(emit: Emit) {
  const { t } = useI18n()
  const accountFlow = useAccount()
  const material = shallowRef<RecoveryMaterial | null>(null)
  const kitRef = ref<{ validate: () => boolean } | null>(null)
  const password = ref('')
  const passwordError = ref<string | null>(null)
  const busy = ref(false)
  const stage = ref<AccountStage | null>(null)
  const error = ref<string | null>(null)

  onMounted(async () => {
    try {
      material.value = await accountFlow.prepareRecoveryKey()
    } catch (cause) {
      error.value = errorKey(cause)
    }
  })

  watch(password, () => {
    passwordError.value = null
    error.value = null
  })

  async function submit() {
    if (busy.value || !material.value) return
    const kitOk = kitRef.value?.validate() ?? false
    if (!password.value) passwordError.value = t('validation.password.required')
    if (!kitOk || !password.value) return
    busy.value = true
    error.value = null
    const current = password.value
    password.value = ''
    try {
      await accountFlow.rotateRecoveryKey(material.value, { password: current }, (next) => {
        stage.value = next
      })
      material.value = null
      emit('done')
    } catch (cause) {
      const key = errorKey(cause, 'reauth')
      if (key === 'errors.WRONG_PASSWORD') passwordError.value = t(key)
      else error.value = key
    } finally {
      busy.value = false
      stage.value = null
    }
  }

  return {
    t,
    login: computed(() => accountFlow.account.value?.login ?? ''),
    material,
    kitRef,
    password,
    passwordError,
    busy,
    stage,
    error,
    submit,
  }
}
