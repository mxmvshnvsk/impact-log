import { totpCodeSchema } from '@impact-log/shared'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorKey } from '@/account'
import { type AccountStage, useAccount } from '@/composables/useAccount'
import { noBreak } from '@/utils/strings'

/**
 * Удаление аккаунта: пароль (проверяется на клиенте и сервером) + код 2FA. Сервер удаляет всё каскадом;
 * записи на устройстве остаются локальными — стереть их можно следующим шагом.
 */
export function useDeleteAccountPanel() {
  const { t } = useI18n()
  const accountFlow = useAccount()
  const login = computed(() => accountFlow.account.value?.login ?? '')
  /** Для заголовка диалога: логин не переносится по дефису */
  const title = computed(() => t('account.delete.dialogTitle', { login: noBreak(login.value) }))

  const open = ref(false)
  const password = ref('')
  const passwordError = ref<string | null>(null)
  const code = ref('')
  const codeError = ref<string | null>(null)
  const busy = ref(false)
  const stage = ref<AccountStage | null>(null)
  const error = ref<string | null>(null)

  watch(password, () => {
    passwordError.value = null
    error.value = null
  })
  // Поле очищаем сами после неверного кода — ошибку при этом не сбрасываем
  watch(code, (value) => {
    if (!value) return
    codeError.value = null
    error.value = null
  })

  function openDialog() {
    password.value = ''
    code.value = ''
    passwordError.value = null
    codeError.value = null
    error.value = null
    open.value = true
  }

  function close() {
    if (!busy.value) open.value = false
  }

  async function confirm() {
    if (busy.value) return
    const parsedCode = totpCodeSchema.safeParse(code.value)
    passwordError.value = password.value ? null : t('validation.password.required')
    codeError.value = parsedCode.success ? null : t('validation.code.format')
    if (!password.value || !parsedCode.success) return
    busy.value = true
    const current = password.value
    password.value = ''
    try {
      await accountFlow.deleteAccount(current, parsedCode.data, (next) => {
        stage.value = next
      })
      // После удаления аккаунт отвязан — экран настроек сам покажет выбор «оставить / стереть»
      open.value = false
    } catch (cause) {
      const key = errorKey(cause, 'reauth')
      if (key === 'errors.WRONG_PASSWORD') passwordError.value = t(key)
      else if (key === 'errors.INVALID_CODE') {
        codeError.value = t(key)
        code.value = ''
      } else error.value = key
    } finally {
      busy.value = false
      stage.value = null
    }
  }

  return {
    t,
    login,
    title,
    open,
    openDialog,
    close,
    password,
    passwordError,
    code,
    codeError,
    busy,
    stage,
    error,
    confirm,
  }
}
