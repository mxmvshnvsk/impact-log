import {
  loginSchema,
  passwordSchema,
  type RegisterStartResponse,
  totpCodeSchema,
} from '@impact-log/shared'
import {
  computed,
  markRaw,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'
import { errorKey, isStepExpiredError, recoveryNotReadyUntil } from '@/account'
import type { RecoveryFactorPhase } from '@/components/RecoveryFactor'
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
import { useRecoveryKeyField } from '@/composables/useRecoveryKeyField'
import { useVault } from '@/composables/useVault'
import { useZodForm } from '@/composables/useZodForm'
import { countActive } from '@/vault'

type Step = 'key' | 'factor' | 'password' | 'totp' | 'done'

const passwordFormSchema = z
  .object({ password: passwordSchema, passwordConfirm: z.string() })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'password.mismatch',
    path: ['passwordConfirm'],
  })

/**
 * Восстановление доступа по Recovery Key (ADR-0008 §7): Recovery Key + ещё один фактор.
 * 1) логин + ключ (recovery-сессия); 2) код 2FA — или, без него, отсчёт 48 часов (RecoveryFactor);
 * 3) новый пароль — ключ открывает recovery-конверт MK прямо в браузере; 4) после пути без 2FA —
 * обязательная новая 2FA (телефона нет); 5) предложить перевыпустить Recovery Key (им воспользовались).
 */
export function useRecoverView() {
  const { t } = useI18n()
  const vault = useVault()
  const accountFlow = useAccount()
  const mascot = reactive(useMascot())

  const step = ref<Step>('key')
  const factorPhase = ref<RecoveryFactorPhase>('code')
  /** Доступ открыт без второго фактора (путь C): новая 2FA обязательна */
  const totpRequired = ref(false)

  const title = computed(() => {
    if (step.value === 'factor') return t(`auth.recoverFactor.titles.${factorPhase.value}`)
    return t(`auth.recover.titles.${step.value}`)
  })
  const subtitle = computed(() => {
    if (step.value === 'factor') {
      return factorPhase.value === 'explain'
        ? undefined
        : t(`auth.recoverFactor.subtitles.${factorPhase.value}`)
    }
    if (step.value === 'done') {
      return t(
        totpRequired.value ? 'auth.recover.subtitles.doneDelay' : 'auth.recover.subtitles.done',
      )
    }
    return t(`auth.recover.subtitles.${step.value}`)
  })

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
  const keyField = useRecoveryKeyField(() => {
    error.value = null
  })

  watch(
    () => form.values.login,
    (value) => {
      mascot.input(value.length)
      error.value = null
    },
  )

  function onLoginBlur() {
    form.onBlur('login')
    mascot.blur()
  }

  function onKeyBlur() {
    mascot.blur()
    keyField.onBlur()
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

  /** Recovery-сессия: второй фактор, затем новый пароль (shallow — внутри замыкания с ключами) */
  const pending = shallowRef<PendingRecovery | null>(null)
  /** На устройстве записи другого хранилища — спрашиваем до восстановления, что с ними сделать */
  const mergePrompt = usePrompt<MergeRequest, MergeChoice>('cancel')

  async function submitKey() {
    if (busy.value) return
    expired.value = false
    error.value = null
    const loginValid = await form.submit(async () => {})
    const keyValid = await keyField.validate({ focus: loginValid })
    if (!loginValid || !keyValid) {
      mascot.react('oops')
      return
    }
    busy.value = true
    try {
      const next = await accountFlow.beginRecovery(
        form.values.login.trim().toLowerCase(),
        keyField.value.value,
        report,
      )
      pending.value?.cancel()
      pending.value = markRaw(next)
      keyField.reset()
      step.value = 'factor'
      mascot.react('happy')
    } catch (cause) {
      error.value = errorKey(cause, 'recovery')
      mascot.react('oops')
    } finally {
      busy.value = false
      stage.value = null
    }
  }

  // ---------- шаг 2: второй фактор (RecoveryFactor) ----------
  function onFactorPhase(phase: RecoveryFactorPhase) {
    factorPhase.value = phase
  }

  function onUnlocked() {
    step.value = 'password'
  }

  /** Recovery-сессия сгорела — начинать с ключа заново */
  function restart(options: { expired?: boolean } = {}) {
    pending.value?.cancel()
    pending.value = null
    step.value = 'key'
    expired.value = options.expired ?? false
  }

  // ---------- шаг 3: новый пароль ----------
  const passwordForm = reactive(
    useZodForm(passwordFormSchema, { password: '', passwordConfirm: '' }),
  )
  /** authKey нового пароля — подтверждает перевыпуск 2FA и Recovery Key без повторного ввода */
  const currentAuthKey = ref<string | null>(null)

  function onPasswordBlur(field: 'password' | 'passwordConfirm') {
    passwordForm.onBlur(field)
    mascot.blur()
  }

  async function submitPassword() {
    if (busy.value || !pending.value) return
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
      const result = await pending.value.complete(captured.password, {
        onStage: report,
        decideMerge: mergePrompt.ask,
      })
      currentAuthKey.value = result.currentAuthKey
      totpRequired.value = result.totpRequired
      pending.value = null
      mascot.react('happy')
      if (result.totpRequired) {
        step.value = 'totp'
        void startTotp()
      } else {
        step.value = 'done'
      }
    } catch (cause) {
      mascot.react('oops')
      if (cause instanceof AccountFlowCancelledError) {
        // Пароль не отправлен, сервер не тронут: можно ввести пароль снова или уйти
        cancelled.value = true
        return
      }
      if (isStepExpiredError(cause)) {
        restart({ expired: true })
        return
      }
      if (recoveryNotReadyUntil(cause) !== undefined) {
        // Отложенное восстановление отменили с вошедшего устройства, пока задавали пароль
        restart()
        error.value = 'auth.recoverFactor.notStarted'
        return
      }
      error.value = errorKey(cause)
    } finally {
      busy.value = false
      stage.value = null
    }
  }

  // ---------- шаг 4 (только без второго фактора): новая 2FA обязательна ----------
  const totpEnrollment = ref<RegisterStartResponse | null>(null)
  const totpBusy = ref(false)
  const totpCode = ref('')
  const totpError = ref<string | null>(null)
  const totpRef = ref<{ focus: () => void } | null>(null)

  watch(totpCode, (value) => {
    if (!value) return
    totpError.value = null
    error.value = null
  })

  /** Сессия после восстановления без 2FA помечена via_recovery: новая 2FA — без текущего кода */
  async function startTotp() {
    if (!currentAuthKey.value || totpBusy.value) return
    totpBusy.value = true
    error.value = null
    try {
      totpEnrollment.value = await accountFlow.startTotpRotation({
        currentAuthKey: currentAuthKey.value,
      })
    } catch (cause) {
      error.value = errorKey(cause, 'reauth')
      mascot.react('oops')
    } finally {
      totpBusy.value = false
    }
  }

  async function confirmTotp(value: string) {
    if (totpBusy.value) return
    const parsed = totpCodeSchema.safeParse(value)
    if (!parsed.success) {
      totpError.value = t('validation.code.format')
      return
    }
    totpBusy.value = true
    error.value = null
    try {
      await accountFlow.confirmTotpRotation(parsed.data)
      totpEnrollment.value = null
      step.value = 'done'
      mascot.react('happy')
    } catch (cause) {
      mascot.react('oops')
      const key = errorKey(cause)
      if (key === 'errors.INVALID_CODE' || key === 'errors.RATE_LIMITED') {
        totpError.value = t(key)
        totpCode.value = ''
        totpRef.value?.focus()
      } else {
        error.value = key
      }
    } finally {
      totpBusy.value = false
    }
  }

  onBeforeUnmount(() => {
    pending.value?.cancel()
    currentAuthKey.value = null
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
    recoveryKey: keyField.value,
    keyError: keyField.error,
    keyRef: keyField.inputRef,
    mergeRequest: mergePrompt.request,
    answerMerge: mergePrompt.answer,
    mergeWarning,
    onLoginBlur,
    onKeyBlur,
    submitKey,
    pending,
    onFactorPhase,
    onUnlocked,
    restart,
    passwordForm,
    onPasswordBlur,
    submitPassword,
    currentAuthKey,
    totpEnrollment,
    totpBusy,
    totpCode,
    totpError,
    totpRef,
    startTotp,
    confirmTotp,
  }
}
