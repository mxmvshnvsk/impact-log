import { type RegisterStartResponse, totpCodeSchema, type User } from '@impact-log/shared'
import QRCode from 'qrcode'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/http'
import { useClipboard } from '@/composables/useClipboard'
import { useMascot } from '@/composables/useMascot'
import { useSession } from '@/composables/useSession'
import { useZodForm } from '@/composables/useZodForm'
import { downloadTextFile, recoveryCodesText } from '@/utils/recoveryCodesFile'
import { registerFormSchema } from './registerSchema'

type Step = 'credentials' | 'totp' | 'recovery'
const STEPS: Step[] = ['credentials', 'totp', 'recovery']

export function useRegisterView() {
  const { t } = useI18n()
  const router = useRouter()
  const session = useSession()
  const mascot = reactive(useMascot())

  const step = ref<Step>('credentials')
  const stepIndex = computed(() => STEPS.indexOf(step.value))
  const eyebrow = computed(() => t('auth.register.stepOf', { step: stepIndex.value + 1, total: 3 }))
  const title = computed(() => t(`auth.register.titles.${step.value}`))
  const subtitle = computed(() => t(`auth.register.subtitles.${step.value}`))

  // ---------- шаг 1 ----------
  const form = reactive(
    useZodForm(registerFormSchema, { login: '', password: '', passwordConfirm: '' }),
  )

  watch(
    () => form.values.login,
    (login) => mascot.input(login.length),
  )

  function onBlur(field: 'login' | 'password' | 'passwordConfirm') {
    form.onBlur(field)
    mascot.blur()
  }

  const enrollment = ref<RegisterStartResponse | null>(null)
  const qrDataUrl = ref<string | null>(null)

  async function submitCredentials() {
    const ok = await form.submit(async ({ login, password }) => {
      enrollment.value = await authApi.register({ login, password })
      // QR генерируется в браузере — секрет не уходит сторонним сервисам
      qrDataUrl.value = await QRCode.toDataURL(enrollment.value.otpauthUri, {
        margin: 1,
        width: 368,
        color: { dark: '#0f1a15', light: '#ffffff' },
      })
    })
    if (ok) {
      step.value = 'totp'
      mascot.react('happy')
    } else if (form.formError) {
      mascot.react('oops')
    }
  }

  // ---------- шаг 2 ----------
  const secret = useClipboard()
  const code = ref('')
  const codeError = ref<string | null>(null)
  const confirming = ref(false)
  const otpRef = ref<{ focus: () => void } | null>(null)
  const recoveryCodes = ref<string[]>([])
  const user = ref<User | null>(null)

  watch(code, () => {
    codeError.value = null
  })

  async function submitCode() {
    if (confirming.value) return
    const parsed = totpCodeSchema.safeParse(code.value)
    if (!parsed.success) {
      codeError.value = t('validation.code.format')
      mascot.react('oops')
      return
    }
    confirming.value = true
    try {
      const result = await authApi.confirmRegistration({ code: parsed.data })
      recoveryCodes.value = result.recoveryCodes
      user.value = result.user
      step.value = 'recovery'
      mascot.react('happy')
    } catch (error) {
      const errorCode = error instanceof ApiError ? error.code : 'UNKNOWN_ERROR'
      mascot.react('oops')
      if (errorCode === 'SESSION_EXPIRED' || errorCode === 'UNAUTHORIZED') {
        step.value = 'credentials'
        form.formError = 'SESSION_EXPIRED'
        return
      }
      codeError.value = t(`errors.${errorCode}`)
      code.value = ''
      otpRef.value?.focus()
    } finally {
      confirming.value = false
    }
  }

  // ---------- шаг 3 ----------
  const codes = useClipboard()
  const codesSaved = ref(false)

  function codesFile() {
    return recoveryCodesText(
      user.value?.login ?? '',
      recoveryCodes.value,
      t('auth.recovery.fileTitle'),
    )
  }

  async function finish() {
    if (!user.value) return
    session.setUser(user.value)
    await router.replace({ name: 'dashboard' })
  }

  // Не даём случайно закрыть вкладку, пока коды не сохранены / 2FA не подтверждена
  const guard = (event: BeforeUnloadEvent) => {
    if (step.value !== 'credentials' && !codesSaved.value) event.preventDefault()
  }
  window.addEventListener('beforeunload', guard)
  onBeforeUnmount(() => window.removeEventListener('beforeunload', guard))

  return {
    t,
    mascot,
    step,
    stepIndex,
    eyebrow,
    title,
    subtitle,
    form,
    onBlur,
    submitCredentials,
    enrollment,
    qrDataUrl,
    secretCopied: secret.copied,
    copySecret: () => secret.copy((enrollment.value?.secret ?? '').replaceAll(' ', '')),
    code,
    codeError,
    confirming,
    otpRef,
    submitCode,
    recoveryCodes,
    codesCopied: codes.copied,
    codesSaved,
    copyCodes: () => codes.copy(recoveryCodes.value.join('\n')),
    downloadCodes: () => downloadTextFile('impact-log-recovery-codes.txt', codesFile()),
    finish,
  }
}
