import { loginSchema, totpCodeSchema } from '@impact-log/shared'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { z } from 'zod'
import { errorKey, isStepExpiredError, type KdfChange } from '@/account'
import type { RecoveryKeyLoginPhase } from '@/components/RecoveryKeyLogin'
import {
  AccountFlowCancelledError,
  type AccountStage,
  type MergeChoice,
  type MergeRequest,
  type PendingSecondFactor,
  useAccount,
} from '@/composables/useAccount'
import { useMascot } from '@/composables/useMascot'
import { usePrompt } from '@/composables/usePrompt'
import { useVault } from '@/composables/useVault'
import { useZodForm } from '@/composables/useZodForm'
import { safeRedirect } from '@/router'
import { countActive } from '@/vault'

/**
 * credentials → second-factor (код 2FA) → вход; или second-factor → recovery-key (путь B: Recovery Key
 * вместо кода, новая 2FA) → recovered (вход выполнен, предложить перевыпустить Recovery Key)
 */
type Step = 'credentials' | 'second-factor' | 'recovery-key' | 'recovered'

/** Пароль на входе проверяет сервер (по authKey) — здесь только «не пустой» */
const credentialsSchema = z.object({
  login: loginSchema,
  password: z.string().min(1, 'password.required'),
})

export function useLoginView() {
  const { t } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const vault = useVault()
  const accountFlow = useAccount()
  const mascot = reactive(useMascot())

  const account = accountFlow.account
  const mode = accountFlow.mode
  const redirectTo = computed(() => safeRedirect(route.query.redirect))

  const step = ref<Step>('credentials')
  /** Уже вошли (сессия жива) — показываем не форму, а переход в журнал. Проверяем один раз при открытии */
  const alreadySignedIn = ref(false)
  const expired = ref(false)
  /** Пользователь отказался в одном из диалогов — вход отменён, записи на устройстве не тронуты */
  const cancelled = ref(false)
  /** Отказались уже после замены 2FA по Recovery Key — новая 2FA действует */
  const cancelledAfterReset = ref(false)
  const busy = ref(false)
  const stage = ref<AccountStage | null>(null)
  /** Ключ i18n ошибки над кнопкой */
  const error = ref<string | null>(null)
  const passwordRef = ref<{ focus: () => void } | null>(null)
  /** Вход после пароля (ждёт второй фактор) — в замыкании KEK; shallow: наружу только методы */
  const pending = shallowRef<PendingSecondFactor | null>(null)
  const recoveryPhase = ref<RecoveryKeyLoginPhase>('key')
  /** authKey пароля после входа по Recovery Key — перевыпуск ключа без повторного ввода пароля */
  const currentAuthKey = ref<string | null>(null)

  const eyebrow = computed(() => {
    if (step.value === 'credentials') return t('auth.login.eyebrow')
    if (step.value === 'second-factor') return t('auth.secondFactor.eyebrow')
    return t('auth.recoveryLogin.eyebrow')
  })
  const title = computed(() => {
    if (alreadySignedIn.value) return t('auth.login.alreadyTitle')
    if (step.value === 'credentials') return t('auth.login.title')
    if (step.value === 'second-factor') return t('auth.secondFactor.title')
    if (step.value === 'recovery-key') return t(`auth.recoveryLogin.titles.${recoveryPhase.value}`)
    return t('auth.recoveryLogin.titles.done')
  })
  const subtitle = computed(() => {
    if (alreadySignedIn.value) return undefined
    if (step.value === 'credentials') return t('auth.login.subtitle')
    if (step.value === 'second-factor') return t('auth.secondFactor.subtitle')
    if (step.value === 'recovery-key') {
      return t(`auth.recoveryLogin.subtitles.${recoveryPhase.value}`)
    }
    return t('auth.recoveryLogin.subtitles.done')
  })

  // ---------- шаг 1: логин + пароль ----------
  const form = reactive(
    useZodForm(credentialsSchema, { login: account.value?.login ?? '', password: '' }),
  )

  watch(
    () => form.values.login,
    (login) => mascot.input(login.length),
  )
  watch(
    () => [form.values.login, form.values.password],
    () => {
      error.value = null
    },
  )

  function onBlur(field: 'login' | 'password') {
    form.onBlur(field)
    mascot.blur()
  }

  /** Вопросы посреди входа: слияние локальных записей и изменившиеся параметры KDF (TOFU) */
  const mergePrompt = usePrompt<MergeRequest, MergeChoice>('cancel')
  const kdfPrompt = usePrompt<KdfChange, boolean>(false)
  const flowOptions = {
    onStage: report,
    decideMerge: mergePrompt.ask,
    confirmKdfChange: kdfPrompt.ask,
  }

  /** Сколько записей на устройстве — предупреждаем, что при входе в другой аккаунт спросим, что с ними делать */
  const localCount = ref(0)
  onMounted(async () => {
    if (!vault.hasVault.value) return
    localCount.value = await countActive('impact').catch(() => 0)
    if (!account.value) return
    await accountFlow.session.refresh()
    alreadySignedIn.value = mode.value === 'signed-in'
  })

  const mergeWarning = computed(() => {
    if (localCount.value === 0) return null
    const bound = account.value?.login
    const entered = form.values.login.trim().toLowerCase()
    if (bound && bound === entered) return null
    return bound
      ? t('auth.login.mergeBound', { login: bound, count: localCount.value })
      : t('auth.login.merge', { count: localCount.value }, localCount.value)
  })

  function report(next: AccountStage) {
    stage.value = next
  }

  /** Отмена в диалоге — не ошибка: возвращаемся к форме с пояснением */
  function isCancelled(cause: unknown): boolean {
    if (!(cause instanceof AccountFlowCancelledError)) return false
    cancelled.value = true
    error.value = null
    mascot.react('oops')
    return true
  }

  async function finish() {
    mascot.react('happy')
    await router.replace(redirectTo.value)
  }

  function fail(cause: unknown) {
    error.value = errorKey(cause, 'login')
    mascot.react('oops')
  }

  async function submitCredentials() {
    if (busy.value) return
    expired.value = false
    cancelled.value = false
    cancelledAfterReset.value = false
    error.value = null
    const captured: { values?: { login: string; password: string } } = {}
    const valid = await form.submit(async (data) => {
      captured.values = data
    })
    if (!valid || !captured.values) {
      mascot.react('oops')
      return
    }

    const { login, password } = captured.values
    busy.value = true
    // Пароль больше нигде не держим: только в этом вызове KDF
    form.values.password = ''
    try {
      const next = await accountFlow.login(login, password, flowOptions)
      if (!next) {
        await finish()
        return
      }
      pending.value = next
      step.value = 'second-factor'
      mascot.react('happy')
    } catch (cause) {
      if (!isCancelled(cause)) fail(cause)
      passwordRef.value?.focus()
    } finally {
      busy.value = false
      stage.value = null
    }
  }

  // ---------- шаг 2: код 2FA ----------
  const code = ref('')
  /** «Запомнить этот компьютер»: сессия на 30 дней и вход без кода с этого устройства */
  const remember = ref(false)
  const codeError = ref<string | null>(null)
  const otpRef = ref<{ focus: () => void } | null>(null)

  // Поле очищаем сами после неверного кода — ошибку при этом не сбрасываем
  watch(code, (value) => {
    if (!value) return
    codeError.value = null
    error.value = null
  })

  async function submitCode(value?: unknown) {
    if (busy.value || !pending.value) return
    const parsed = totpCodeSchema.safeParse(typeof value === 'string' ? value : code.value)
    if (!parsed.success) {
      codeError.value = t('validation.code.format')
      mascot.react('oops')
      return
    }
    busy.value = true
    try {
      await pending.value.verify(parsed.data, remember.value, report)
      pending.value = null
      await finish()
    } catch (cause) {
      mascot.react('oops')
      if (cause instanceof AccountFlowCancelledError) {
        restart()
        isCancelled(cause)
        return
      }
      if (isStepExpiredError(cause)) {
        restart()
        expired.value = true
        return
      }
      const key = errorKey(cause, 'login')
      if (key === 'errors.INVALID_CODE') {
        codeError.value = t(key)
        code.value = ''
        otpRef.value?.focus()
      } else {
        error.value = key
      }
    } finally {
      busy.value = false
      stage.value = null
    }
  }

  function restart() {
    pending.value?.cancel()
    pending.value = null
    step.value = 'credentials'
    code.value = ''
    form.values.password = ''
  }

  // ---------- путь B: нет доступа к приложению 2FA → Recovery Key вместо кода ----------
  function chooseRecoveryKey() {
    if (busy.value) return
    error.value = null
    codeError.value = null
    step.value = 'recovery-key'
  }

  function onRecoveryPhase(phase: RecoveryKeyLoginPhase) {
    recoveryPhase.value = phase
  }

  function backToCode() {
    step.value = 'second-factor'
  }

  function onRecoveryExpired() {
    restart()
    expired.value = true
  }

  function onRecoveryCancelled() {
    restart()
    cancelled.value = true
    cancelledAfterReset.value = true
  }

  function onRecovered(authKey: string) {
    pending.value = null
    currentAuthKey.value = authKey
    step.value = 'recovered'
  }

  onBeforeUnmount(() => {
    pending.value?.cancel()
    currentAuthKey.value = null
  })

  /** «Начать без синхронизации»: локальное хранилище на этом устройстве */
  async function startLocal() {
    try {
      await vault.create()
      await router.replace({ name: 'dashboard' })
    } catch (cause) {
      fail(cause)
    }
  }

  return {
    t,
    mascot,
    mode,
    alreadySignedIn,
    account,
    hasVault: vault.hasVault,
    vaultUnavailable: computed(() => vault.status.value === 'unavailable'),
    eyebrow,
    title,
    subtitle,
    redirectTo,
    step,
    form,
    expired,
    cancelled,
    cancelledAfterReset,
    busy,
    stage,
    error,
    mergeWarning,
    mergeRequest: mergePrompt.request,
    answerMerge: mergePrompt.answer,
    kdfChange: kdfPrompt.request,
    answerKdf: kdfPrompt.answer,
    passwordRef,
    onBlur,
    submitCredentials,
    code,
    remember,
    codeError,
    otpRef,
    submitCode,
    restart,
    pending,
    chooseRecoveryKey,
    onRecoveryPhase,
    backToCode,
    onRecoveryExpired,
    onRecoveryCancelled,
    onRecovered,
    currentAuthKey,
    finish,
    startLocal,
  }
}
