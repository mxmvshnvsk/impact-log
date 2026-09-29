import { totpCodeSchema } from '@impact-log/shared'
import { CloudUpload, KeyRound, MonitorSmartphone } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorKey, isStepExpiredError } from '@/account'
import { ApiError } from '@/api/http'
import { type AccountStage, type PreparedRegistration, useAccount } from '@/composables/useAccount'
import { useMascot } from '@/composables/useMascot'
import { useVault } from '@/composables/useVault'
import { useZodForm } from '@/composables/useZodForm'
import { countActive } from '@/vault'
import { loginOnlySchema, registerFormSchema } from './registerSchema'

type Step = 'credentials' | 'kit' | 'totp' | 'done'
const STEPS: Step[] = ['credentials', 'kit', 'totp', 'done']

const DONE_ITEMS = [
  { key: 'encrypted', icon: KeyRound },
  { key: 'sync', icon: CloudUpload },
  { key: 'devices', icon: MonitorSmartphone },
] as const

/**
 * «Включить синхронизацию» (ADR-0006): логин + пароль → Recovery Kit → отправка → 2FA → готово.
 * Пароль превращается в ключи (Argon2id в воркере) сразу на шаге 1 и дальше не хранится.
 */
export function useRegisterView() {
  const { t } = useI18n()
  const vault = useVault()
  const accountFlow = useAccount()
  const mascot = reactive(useMascot())

  const account = accountFlow.account
  /** Хранилище уже в аккаунте — второй аккаунт только после выхода (проверяем при открытии) */
  const alreadyLinked = ref(account.value !== null)

  const step = ref<Step>('credentials')
  const stepIndex = computed(() => STEPS.indexOf(step.value))
  // Уже вошли — это не шаг мастера, а состояние: метка как на входе («Синхронизация»)
  const eyebrow = computed(() =>
    alreadyLinked.value
      ? t('auth.login.eyebrow')
      : t('auth.register.stepOf', { step: stepIndex.value + 1, total: STEPS.length }),
  )
  const title = computed(() =>
    alreadyLinked.value ? t('auth.register.alreadyTitle') : t(`auth.register.titles.${step.value}`),
  )
  const subtitle = computed(() =>
    alreadyLinked.value ? undefined : t(`auth.register.subtitles.${step.value}`),
  )

  const busy = ref(false)
  const stage = ref<AccountStage | null>(null)
  const error = ref<string | null>(null)
  const report = (next: AccountStage) => {
    stage.value = next
  }

  const localCount = ref(0)
  onMounted(async () => {
    if (vault.hasVault.value) localCount.value = await countActive('impact').catch(() => 0)
  })

  // ---------- шаг 1 ----------
  const form = reactive(
    useZodForm(registerFormSchema, { login: '', password: '', passwordConfirm: '' }),
  )
  const loginForm = reactive(
    useZodForm(loginOnlySchema, { login: '', password: '', passwordConfirm: '' }),
  )
  /** MK, Recovery Key и конверт пароля — выведены на шаге 1 */
  const prepared = shallowRef<PreparedRegistration | null>(null)
  const passwordReady = computed(() => prepared.value !== null)
  /** Логин, под которым показан Recovery Kit (в файле ключа он тоже записан) */
  const login = ref('')

  watch(
    () => form.values.login,
    (value) => {
      mascot.input(value.length)
      error.value = null
    },
  )

  function onBlur(field: 'login' | 'password' | 'passwordConfirm') {
    form.onBlur(field)
    mascot.blur()
  }

  function discardPrepared() {
    prepared.value?.masterKey.fill(0)
    prepared.value = null
  }

  function resetPassword() {
    discardPrepared()
    form.values.password = ''
    form.values.passwordConfirm = ''
  }

  async function submitCredentials() {
    if (busy.value) return
    error.value = null
    const captured: { values?: { login: string; password: string } } = {}
    // Пароль уже превращён в ключи — проверяем только логин
    const target = passwordReady.value ? loginForm : form
    if (passwordReady.value) loginForm.values.login = form.values.login
    const valid = await target.submit(async (values) => {
      captured.values = values
    })
    const values = captured.values
    if (!valid || !values) {
      if (passwordReady.value) Object.assign(form.errors, loginForm.errors)
      mascot.react('oops')
      return
    }

    if (!prepared.value) {
      busy.value = true
      const password = values.password
      form.values.password = ''
      form.values.passwordConfirm = ''
      try {
        prepared.value = await accountFlow.prepareRegistration(password, report)
      } catch (cause) {
        error.value = errorKey(cause)
        mascot.react('oops')
        return
      } finally {
        busy.value = false
        stage.value = null
      }
    }
    login.value = values.login
    step.value = 'kit'
    mascot.react('happy')
  }

  // ---------- шаг 2: Recovery Kit → отправка ----------
  const kitRef = ref<{ validate: () => boolean } | null>(null)
  const enrollment = ref<{ otpauthUri: string; secret: string } | null>(null)

  function back() {
    error.value = null
    step.value = 'credentials'
  }

  async function submitKit() {
    if (busy.value || !prepared.value) return
    if (!kitRef.value?.validate()) {
      mascot.react('oops')
      return
    }
    busy.value = true
    error.value = null
    try {
      enrollment.value = await accountFlow.startRegistration(login.value, prepared.value, report)
      step.value = 'totp'
      mascot.react('happy')
    } catch (cause) {
      mascot.react('oops')
      if (cause instanceof ApiError && cause.code === 'LOGIN_TAKEN') {
        step.value = 'credentials'
        // Код уже отправляли, а логин «занят» — скорее всего, сервер подтвердил регистрацию,
        // но ответ не дошёл: подсказываем войти (записи при входе предложит объединить)
        error.value = codeSubmitted ? 'auth.register.maybeCreated' : errorKey(cause)
        return
      }
      error.value = errorKey(cause)
    } finally {
      busy.value = false
      stage.value = null
    }
  }

  // ---------- шаг 3: 2FA ----------
  /** Код подтверждения хотя бы раз уходил на сервер (см. обработку LOGIN_TAKEN выше) */
  let codeSubmitted = false
  const code = ref('')
  const remember = ref(false)
  const codeError = ref<string | null>(null)
  const totpRef = ref<{ focus: () => void } | null>(null)

  // Поле очищаем сами после неверного кода — ошибку при этом не сбрасываем
  watch(code, (value) => {
    if (!value) return
    codeError.value = null
    error.value = null
  })

  async function submitCode(value: string) {
    if (busy.value || !prepared.value) return
    const parsed = totpCodeSchema.safeParse(value)
    if (!parsed.success) {
      codeError.value = t('validation.code.format')
      mascot.react('oops')
      return
    }
    busy.value = true
    codeSubmitted = true
    try {
      // Хранилище переходит на MK нового аккаунта только здесь — после подтверждения кода
      await accountFlow.confirmRegistration(parsed.data, remember.value, prepared.value, report)
      discardPrepared()
      step.value = 'done'
      mascot.react('happy')
    } catch (cause) {
      mascot.react('oops')
      if (isStepExpiredError(cause)) {
        // Регистрация сгорела (30 минут или 5 неверных кодов) — начинаем с логина, ключи остаются
        step.value = 'credentials'
        enrollment.value = null
        error.value = 'errors.SESSION_EXPIRED'
        return
      }
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
      stage.value = null
    }
  }

  // Не даём случайно закрыть вкладку посреди регистрации (ключ не сохранён / 2FA не подтверждена)
  const guard = (event: BeforeUnloadEvent) => {
    if (step.value === 'kit' || step.value === 'totp') event.preventDefault()
  }
  window.addEventListener('beforeunload', guard)
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', guard)
    discardPrepared()
  })

  return {
    t,
    mascot,
    account,
    alreadyLinked,
    steps: STEPS,
    step,
    stepIndex,
    eyebrow,
    title,
    subtitle,
    form,
    onBlur,
    passwordReady,
    resetPassword,
    localCount,
    busy,
    stage,
    error,
    submitCredentials,
    prepared,
    login,
    kitRef,
    back,
    submitKit,
    enrollment,
    code,
    remember,
    codeError,
    totpRef,
    submitCode,
    doneItems: DONE_ITEMS,
  }
}
