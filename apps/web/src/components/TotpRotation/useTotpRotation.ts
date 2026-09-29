import { type TotpEnrollment, totpCodeSchema } from '@impact-log/shared'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorKey } from '@/account'
import { type AccountStage, useAccount } from '@/composables/useAccount'

export type TotpRotationEmits = { done: []; cancel: [] }
type Emit = ((event: 'done') => void) & ((event: 'cancel') => void)

/**
 * Перевыпуск 2FA: текущий пароль + текущий код 2FA → новый секрет (старый работает до подтверждения)
 * → код из нового → готово. Потеряли телефон — путь через восстановление по Recovery Key (там код не нужен).
 */
export function useTotpRotation(emit: Emit) {
  const { t } = useI18n()
  const accountFlow = useAccount()
  const password = ref('')
  const passwordError = ref<string | null>(null)
  const currentCode = ref('')
  const currentCodeError = ref<string | null>(null)
  const currentCodeRef = ref<{ focus: () => void } | null>(null)
  const busy = ref(false)
  const stage = ref<AccountStage | null>(null)
  const error = ref<string | null>(null)
  const enrollment = ref<TotpEnrollment | null>(null)
  const code = ref('')
  const codeError = ref<string | null>(null)
  const totpRef = ref<{ focus: () => void } | null>(null)

  watch(password, () => {
    passwordError.value = null
    error.value = null
  })
  watch(currentCode, (value) => {
    if (!value) return
    currentCodeError.value = null
    error.value = null
  })
  // Поле очищаем сами после неверного кода — ошибку при этом не сбрасываем
  watch(code, (value) => {
    if (!value) return
    codeError.value = null
    error.value = null
  })

  async function start() {
    if (busy.value) return
    const parsedCode = totpCodeSchema.safeParse(currentCode.value)
    if (!password.value) passwordError.value = t('validation.password.required')
    if (!parsedCode.success) currentCodeError.value = t('validation.code.format')
    if (!password.value || !parsedCode.success) return
    busy.value = true
    const current = password.value
    password.value = ''
    try {
      enrollment.value = await accountFlow.startTotpRotation(
        { password: current, code: parsedCode.data },
        (next) => {
          stage.value = next
        },
      )
      currentCode.value = ''
    } catch (cause) {
      const key = errorKey(cause, 'reauth')
      if (key === 'errors.WRONG_PASSWORD') passwordError.value = t(key)
      else if (key === 'errors.INVALID_CODE') {
        currentCodeError.value = t(key)
        currentCode.value = ''
        currentCodeRef.value?.focus()
      } else error.value = key
    } finally {
      busy.value = false
      stage.value = null
    }
  }

  async function confirm(value: string) {
    if (busy.value) return
    const parsed = totpCodeSchema.safeParse(value)
    if (!parsed.success) {
      codeError.value = t('validation.code.format')
      return
    }
    busy.value = true
    try {
      await accountFlow.confirmTotpRotation(parsed.data)
      enrollment.value = null
      emit('done')
    } catch (cause) {
      const key = errorKey(cause)
      if (key === 'errors.INVALID_CODE') {
        codeError.value = t(key)
        code.value = ''
        totpRef.value?.focus()
      } else {
        error.value = key
      }
    } finally {
      busy.value = false
    }
  }

  return {
    t,
    login: computed(() => accountFlow.account.value?.login ?? ''),
    password,
    passwordError,
    currentCode,
    currentCodeError,
    currentCodeRef,
    busy,
    stage,
    error,
    start,
    enrollment,
    code,
    codeError,
    totpRef,
    confirm,
  }
}
