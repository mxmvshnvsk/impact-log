import { parseRecoveryKey } from '@impact-log/core/crypto'
import {
  loginSchema,
  passwordSchema,
  type RegisterStartResponse,
  totpCodeSchema,
} from '@impact-log/shared'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'
import { errorKey, isStepExpiredError, type RecoveryMaterial } from '@/account'
import {
  AccountFlowCancelledError,
  type AccountStage,
  type MergeChoice,
  type MergeRequest,
  type PendingRecovery,
  useAccount,
} from '@/composables/useAccount'
import { useMascot } from '@/composables/useMascot'
import { usePrompt } from '@/composables/usePrompt'
import { useVault } from '@/composables/useVault'
import { useZodForm } from '@/composables/useZodForm'
import { countActive } from '@/vault'

type Step = 'key' | 'password' | 'done'
type TaskState = 'idle' | 'enroll' | 'kit' | 'done'

const passwordFormSchema = z
  .object({ password: passwordSchema, passwordConfirm: z.string() })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'password.mismatch',
    path: ['passwordConfirm'],
  })

/**
 * Восстановление доступа по Recovery Key (ADR-0006): ключ открывает recovery-конверт MK прямо в
 * браузере → новый пароль → новые соль/ключи/конверт. Recovery Key заменяет и пароль, и 2FA,
 * поэтому сразу предлагаем перевыпустить 2FA и сам ключ.
 */
export function useRecoverView() {
  const { t } = useI18n()
  const vault = useVault()
  const accountFlow = useAccount()
  const mascot = reactive(useMascot())

  const step = ref<Step>('key')
  const title = computed(() =>
    step.value === 'key'
      ? t('auth.recover.title')
      : step.value === 'password'
        ? t('auth.recover.passwordTitle')
        : t('auth.recover.doneTitle'),
  )
  const subtitle = computed(() =>
    step.value === 'key'
      ? t('auth.recover.subtitle')
      : step.value === 'password'
        ? t('auth.recover.passwordSubtitle')
        : t('auth.recover.doneSubtitle'),
  )

  const expired = ref(false)
  /** Отказались в диалоге о локальных записях — на сервере ничего не менялось */
  const cancelled = ref(false)
  const busy = ref(false)
  const stage = ref<AccountStage | null>(null)
  const error = ref<string | null>(null)
  const report = (next: AccountStage) => {
    stage.value = next
  }

  // ---------- шаг 1: логин + ключ ----------
  const form = reactive(
    useZodForm(z.object({ login: loginSchema }), { login: accountFlow.account.value?.login ?? '' }),
  )
  const recoveryKey = ref('')
  const keyError = ref<string | null>(null)
  const keyRef = ref<{ focus: () => void } | null>(null)
  let keyTouched = false

  watch(
    () => form.values.login,
    (value) => {
      mascot.input(value.length)
      error.value = null
    },
  )

  /** Формат и контрольная сумма ключа — прямо в поле, до запроса к серверу */
  async function checkKey(): Promise<boolean> {
    if (!recoveryKey.value.trim()) {
      keyError.value = t('errors.RECOVERY_KEY_FORMAT')
      return false
    }
    try {
      ;(await parseRecoveryKey(recoveryKey.value)).fill(0)
      keyError.value = null
      return true
    } catch (cause) {
      keyError.value = t(errorKey(cause, 'recovery'))
      return false
    }
  }

  watch(recoveryKey, () => {
    error.value = null
    if (keyTouched) void checkKey()
  })

  function onLoginBlur() {
    form.onBlur('login')
    mascot.blur()
  }

  function onKeyBlur() {
    mascot.blur()
    if (!recoveryKey.value.trim()) return
    keyTouched = true
    void checkKey()
  }

  const localCount = ref(0)
  onMounted(async () => {
    if (vault.hasVault.value) localCount.value = await countActive('impact').catch(() => 0)
  })
  const mergeWarning = computed(() => {
    if (localCount.value === 0) return null
    const bound = accountFlow.account.value?.login
    if (bound && bound === form.values.login.trim().toLowerCase()) return null
    return bound
      ? t('auth.login.mergeBound', { login: bound, count: localCount.value })
      : t('auth.login.merge', { count: localCount.value }, localCount.value)
  })

  let pending: PendingRecovery | null = null
  /** На устройстве записи другого хранилища — спрашиваем до восстановления, что с ними сделать */
  const mergePrompt = usePrompt<MergeRequest, MergeChoice>('cancel')

  async function submitKey() {
    if (busy.value) return
    expired.value = false
    error.value = null
    const loginValid = await form.submit(async () => {})
    keyTouched = true
    const keyValid = await checkKey()
    if (!loginValid || !keyValid) {
      if (loginValid) keyRef.value?.focus()
      mascot.react('oops')
      return
    }
    busy.value = true
    try {
      pending = await accountFlow.beginRecovery(
        form.values.login.trim().toLowerCase(),
        recoveryKey.value,
        report,
      )
      recoveryKey.value = ''
      keyTouched = false
      step.value = 'password'
      mascot.react('happy')
    } catch (cause) {
      error.value = errorKey(cause, 'recovery')
      mascot.react('oops')
    } finally {
      busy.value = false
      stage.value = null
    }
  }

  // ---------- шаг 2: новый пароль ----------
  const passwordForm = reactive(
    useZodForm(passwordFormSchema, { password: '', passwordConfirm: '' }),
  )
  /** authKey нового пароля — подтверждает перевыпуск 2FA и Recovery Key без повторного ввода */
  let currentAuthKey: string | null = null

  function onPasswordBlur(field: 'password' | 'passwordConfirm') {
    passwordForm.onBlur(field)
    mascot.blur()
  }

  async function submitPassword() {
    if (busy.value || !pending) return
    error.value = null
    cancelled.value = false
    const captured: { password?: string } = {}
    const valid = await passwordForm.submit(async (data) => {
      captured.password = data.password
    })
    if (!valid || !captured.password) {
      mascot.react('oops')
      return
    }
    busy.value = true
    passwordForm.values.password = ''
    passwordForm.values.passwordConfirm = ''
    try {
      const result = await pending.complete(captured.password, {
        onStage: report,
        decideMerge: mergePrompt.ask,
      })
      currentAuthKey = result.currentAuthKey
      pending = null
      step.value = 'done'
      mascot.react('happy')
    } catch (cause) {
      mascot.react('oops')
      if (cause instanceof AccountFlowCancelledError) {
        // Пароль не отправлен, сервер не тронут: можно ввести пароль снова или уйти
        cancelled.value = true
        return
      }
      if (isStepExpiredError(cause)) {
        pending?.cancel()
        pending = null
        step.value = 'key'
        expired.value = true
        return
      }
      error.value = errorKey(cause)
    } finally {
      busy.value = false
      stage.value = null
    }
  }

  // ---------- шаг 3: перевыпуск 2FA и Recovery Key ----------
  const taskBusy = ref<'totp' | 'key' | null>(null)
  const totpState = ref<TaskState>('idle')
  const totpEnrollment = ref<RegisterStartResponse | null>(null)
  const totpCode = ref('')
  const totpError = ref<string | null>(null)
  const totpRef = ref<{ focus: () => void } | null>(null)

  watch(totpCode, (value) => {
    if (value) totpError.value = null
  })

  async function startTotp() {
    if (!currentAuthKey || taskBusy.value) return
    taskBusy.value = 'totp'
    error.value = null
    try {
      totpEnrollment.value = await accountFlow.startTotpRotation({ currentAuthKey })
      totpState.value = 'enroll'
    } catch (cause) {
      error.value = errorKey(cause, 'reauth')
    } finally {
      taskBusy.value = null
    }
  }

  async function confirmTotp(value: string) {
    if (taskBusy.value) return
    const parsed = totpCodeSchema.safeParse(value)
    if (!parsed.success) {
      totpError.value = t('validation.code.format')
      return
    }
    taskBusy.value = 'totp'
    try {
      await accountFlow.confirmTotpRotation(parsed.data)
      totpState.value = 'done'
      totpEnrollment.value = null
      mascot.react('happy')
    } catch (cause) {
      mascot.react('oops')
      totpError.value = t(errorKey(cause))
      totpCode.value = ''
      totpRef.value?.focus()
    } finally {
      taskBusy.value = null
    }
  }

  const keyState = ref<TaskState>('idle')
  const keyMaterial = shallowRef<RecoveryMaterial | null>(null)
  const kitRef = ref<{ validate: () => boolean } | null>(null)

  async function startKey() {
    if (taskBusy.value) return
    taskBusy.value = 'key'
    error.value = null
    try {
      keyMaterial.value = await accountFlow.prepareRecoveryKey()
      keyState.value = 'kit'
    } catch (cause) {
      error.value = errorKey(cause)
    } finally {
      taskBusy.value = null
    }
  }

  async function submitNewKey() {
    if (!currentAuthKey || !keyMaterial.value || taskBusy.value) return
    if (!kitRef.value?.validate()) return
    taskBusy.value = 'key'
    error.value = null
    try {
      await accountFlow.rotateRecoveryKey(keyMaterial.value, { currentAuthKey })
      keyState.value = 'done'
      keyMaterial.value = null
      mascot.react('happy')
    } catch (cause) {
      error.value = errorKey(cause, 'reauth')
      mascot.react('oops')
    } finally {
      taskBusy.value = null
    }
  }

  onBeforeUnmount(() => {
    pending?.cancel()
    currentAuthKey = null
  })

  return {
    t,
    mascot,
    step,
    title,
    subtitle,
    expired,
    cancelled,
    busy,
    stage,
    error,
    form,
    mergeRequest: mergePrompt.request,
    answerMerge: mergePrompt.answer,
    recoveryKey,
    keyError,
    keyRef,
    mergeWarning,
    onLoginBlur,
    onKeyBlur,
    submitKey,
    passwordForm,
    onPasswordBlur,
    submitPassword,
    taskBusy,
    totpState,
    totpEnrollment,
    totpCode,
    totpError,
    totpRef,
    startTotp,
    confirmTotp,
    keyState,
    keyMaterial,
    kitRef,
    startKey,
    submitNewKey,
  }
}
