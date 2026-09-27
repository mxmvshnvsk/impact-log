import {
  type LoginResponse,
  loginRequestSchema,
  recoveryCodeSchema,
  totpCodeSchema,
  type User,
} from '@impact-log/shared'
import { reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/http'
import { useMascot } from '@/composables/useMascot'
import { useSession } from '@/composables/useSession'
import { useZodForm } from '@/composables/useZodForm'
import { safeRedirect } from '@/router'

type Step = 'credentials' | 'second-factor'
type Method = 'totp' | 'recovery'

export function useLoginView() {
  const { t } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const session = useSession()
  const mascot = reactive(useMascot())

  const step = ref<Step>('credentials')
  const expired = ref(false)

  // ---------- шаг 1: логин + пароль ----------
  const credentials = reactive(useZodForm(loginRequestSchema, { login: '', password: '' }))

  watch(
    () => credentials.values.login,
    (login) => mascot.input(login.length),
  )

  function onBlur(field: 'login' | 'password') {
    credentials.onBlur(field)
    mascot.blur()
  }

  async function submitCredentials() {
    expired.value = false
    let result: LoginResponse | null = null
    const ok = await credentials.submit(async (data) => {
      result = await authApi.login(data)
    })
    if (ok && result) {
      mascot.react('happy')
      // Доверенное устройство («Запомнить этот компьютер») — код не нужен
      if ((result as LoginResponse).next === 'done') {
        await finish((result as Extract<LoginResponse, { next: 'done' }>).user)
        return
      }
      step.value = 'second-factor'
    } else if (credentials.formError) {
      mascot.react('oops')
    }
  }

  // ---------- шаг 2: код из приложения или резервный код ----------
  const method = ref<Method>('totp')
  const code = ref('')
  /** «Запомнить этот компьютер»: сессия на 30 дней и вход без кода с этого устройства */
  const remember = ref(false)
  const codeError = ref<string | null>(null)
  const verifying = ref(false)
  const otpRef = ref<{ focus: () => void } | null>(null)

  watch(code, () => {
    codeError.value = null
  })

  async function submitSecondFactor() {
    if (verifying.value) return
    const parsed = (method.value === 'totp' ? totpCodeSchema : recoveryCodeSchema).safeParse(
      code.value,
    )
    if (!parsed.success) {
      codeError.value = t(`validation.${parsed.error.issues[0]?.message ?? 'code.format'}`)
      mascot.react('oops')
      return
    }

    verifying.value = true
    try {
      const { user } = await authApi.verifySecondFactor({
        method: method.value,
        code: parsed.data,
        remember: remember.value,
      })
      mascot.react('happy')
      await finish(user)
    } catch (error) {
      const errorCode = error instanceof ApiError ? error.code : 'UNKNOWN_ERROR'
      mascot.react('oops')
      if (errorCode === 'SESSION_EXPIRED' || errorCode === 'UNAUTHORIZED') {
        restart()
        expired.value = true
        return
      }
      codeError.value = t(`errors.${errorCode}`)
      code.value = ''
      otpRef.value?.focus()
    } finally {
      verifying.value = false
    }
  }

  async function finish(user: User) {
    session.setUser(user)
    await router.replace(safeRedirect(route.query.redirect))
  }

  function toggleMethod() {
    method.value = method.value === 'totp' ? 'recovery' : 'totp'
    code.value = ''
  }

  function restart() {
    step.value = 'credentials'
    method.value = 'totp'
    code.value = ''
    credentials.values.password = ''
  }

  return {
    t,
    mascot,
    step,
    credentials,
    expired,
    onBlur,
    submitCredentials,
    method,
    code,
    remember,
    codeError,
    verifying,
    otpRef,
    submitSecondFactor,
    toggleMethod,
    restart,
  }
}
