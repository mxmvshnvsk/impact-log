import { passwordSchema } from '@impact-log/shared'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'
import { errorKey } from '@/account'
import { type AccountStage, useAccount } from '@/composables/useAccount'
import { useZodForm } from '@/composables/useZodForm'

export type ChangePasswordEmits = { done: []; cancel: [] }
type Emit = ((event: 'done') => void) & ((event: 'cancel') => void)

const schema = z
  .object({
    current: z.string().min(1, 'password.required'),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'password.mismatch',
    path: ['passwordConfirm'],
  })

/**
 * Смена пароля: текущий пароль открывает password-конверт (проверка на клиенте) и даёт currentAuthKey;
 * новый — новые соль, KEK, authKey и конверт того же MK. Записи не перешифровываются.
 */
export function useChangePasswordForm(emit: Emit) {
  const { t } = useI18n()
  const accountFlow = useAccount()
  const form = reactive(useZodForm(schema, { current: '', password: '', passwordConfirm: '' }))
  const busy = ref(false)
  const stage = ref<AccountStage | null>(null)
  const error = ref<string | null>(null)
  /** Неверный текущий пароль — ошибка этого поля, а не всей формы (как в других формах безопасности) */
  const currentError = ref<string | null>(null)
  const currentRef = ref<{ focus: () => void } | null>(null)

  watch(
    () => form.values.current,
    () => {
      currentError.value = null
    },
  )

  async function submit() {
    if (busy.value) return
    error.value = null
    const captured: { current?: string; password?: string } = {}
    const valid = await form.submit(async (data) => {
      captured.current = data.current
      captured.password = data.password
    })
    if (!valid || !captured.current || !captured.password) return
    busy.value = true
    form.values.current = ''
    form.values.password = ''
    form.values.passwordConfirm = ''
    try {
      await accountFlow.changePassword(captured.current, captured.password, (next) => {
        stage.value = next
      })
      emit('done')
    } catch (cause) {
      const key = errorKey(cause, 'reauth')
      // Новый пароль уже проверен — не заставляем вводить его дважды заново
      form.values.password = captured.password
      form.values.passwordConfirm = captured.password
      if (key === 'errors.WRONG_PASSWORD') currentError.value = t(key)
      else error.value = key
    } finally {
      busy.value = false
      stage.value = null
    }
    if (currentError.value) {
      // поле было disabled на время запроса — фокус только после его разблокировки
      await nextTick()
      currentRef.value?.focus()
    }
  }

  return {
    t,
    login: computed(() => accountFlow.account.value?.login ?? ''),
    form,
    busy,
    stage,
    error,
    currentError,
    currentRef,
    submit,
  }
}
