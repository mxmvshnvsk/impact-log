import type { TotpEnrollment } from '@impact-log/shared'
import QRCode from 'qrcode'
import { type Ref, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClipboard } from '@/composables/useClipboard'

export type TotpEnrollProps = {
  /** Секрет с сервера (register, login/recovery-key, account/totp/start) и otpauth:// URI от клиента */
  enrollment: TotpEnrollment
  submitting?: boolean
  /** Уже переведённый текст ошибки кода */
  error?: string | null
  /** Флажок «Запомнить этот компьютер» (регистрация) */
  showRemember?: boolean
  submitLabel?: string
}

export type TotpEnrollEmits = { submit: [code: string]; focus: []; blur: [] }

type Emit = ((event: 'submit', code: string) => void) &
  ((event: 'focus') => void) &
  ((event: 'blur') => void)

/**
 * Подключение приложения-аутентификатора: QR (генерируется в браузере — секрет не уходит сторонним
 * сервисам), секрет для ручного ввода и первый код.
 */
export function useTotpEnroll(props: TotpEnrollProps, emit: Emit, code: Ref<string>) {
  const { t } = useI18n()
  const clipboard = useClipboard()
  const qrDataUrl = ref<string | null>(null)
  const otpRef = ref<{ focus: () => void } | null>(null)

  watch(
    () => props.enrollment.otpauthUri,
    async (uri) => {
      qrDataUrl.value = null
      // QR всегда тёмный на белом — сканируется в любой теме
      qrDataUrl.value = await QRCode.toDataURL(uri, {
        margin: 1,
        width: 368,
        color: { dark: '#0f1a15', light: '#ffffff' },
      })
    },
    { immediate: true },
  )

  /** Автоотправка по 6-й цифре приходит со значением — v-model родителя к этому моменту ещё не вернулся */
  function submit(value?: unknown) {
    if (props.submitting) return
    emit('submit', typeof value === 'string' ? value : code.value)
  }

  function focus() {
    otpRef.value?.focus()
  }

  return {
    t,
    qrDataUrl,
    copied: clipboard.copied,
    copySecret: () => clipboard.copy(props.enrollment.secret.replaceAll(' ', '')),
    otpRef,
    submit,
    focus,
  }
}
