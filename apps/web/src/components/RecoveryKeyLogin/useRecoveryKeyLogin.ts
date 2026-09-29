import { type RegisterStartResponse, totpCodeSchema } from '@impact-log/shared'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorKey, isStepExpiredError } from '@/account'
import {
  AccountFlowCancelledError,
  type AccountStage,
  type PendingSecondFactor,
} from '@/composables/useAccount'
import type { Mascot } from '@/composables/useMascot'
import { useRecoveryKeyField } from '@/composables/useRecoveryKeyField'

/** key — Recovery Key вместо кода; enroll — подключить новую 2FA и завершить вход */
export type RecoveryKeyLoginPhase = 'key' | 'enroll'

export type RecoveryKeyLoginProps = {
  /** Вход после пароля, ждёт второй фактор */
  pending: PendingSecondFactor
  mascot: Pick<Mascot, 'focus' | 'blur' | 'react'>
}

export type RecoveryKeyLoginEmits = {
  phase: [phase: RecoveryKeyLoginPhase]
  /** Вход выполнен; authKey пароля — перевыпустить Recovery Key без повторного ввода */
  done: [currentAuthKey: string]
  /** Сессия второго шага сгорела — вход заново */
  expired: []
  /** Отказались в диалоге о локальных записях (2FA к этому моменту уже заменена) */
  cancelled: []
  /** Назад к вводу кода */
  back: []
}

type Emit = ((event: 'phase', phase: RecoveryKeyLoginPhase) => void) &
  ((event: 'done', currentAuthKey: string) => void) &
  ((event: 'expired') => void) &
  ((event: 'cancelled') => void) &
  ((event: 'back') => void)

/**
 * Путь B (ADR-0008 §7): пароль помнит, телефона нет. Recovery Key вместо кода → новая 2FA → вход как
 * обычно (ключи, хранилище, слияние, синхронизация). Старая 2FA и все остальные сессии сбрасываются.
 */
export function useRecoveryKeyLogin(props: RecoveryKeyLoginProps, emit: Emit) {
  const { t } = useI18n()
  const phase = ref<RecoveryKeyLoginPhase>('key')
  const busy = ref(false)
  const stage = ref<AccountStage | null>(null)
  const error = ref<string | null>(null)
  const report = (next: AccountStage) => {
    stage.value = next
  }

  watch(phase, (next) => emit('phase', next), { immediate: true })

  function oops() {
    props.mascot.react('oops')
  }

  // ---------- Recovery Key ----------
  const keyField = useRecoveryKeyField(() => {
    error.value = null
  })

  function onKeyBlur() {
    props.mascot.blur()
    keyField.onBlur()
  }

  const enrollment = ref<RegisterStartResponse | null>(null)

  async function submitKey() {
    if (busy.value) return
    error.value = null
    if (!(await keyField.validate({ focus: true }))) {
      oops()
      return
    }
    busy.value = true
    try {
      enrollment.value = await props.pending.submitRecoveryKey(keyField.value.value, report)
      keyField.reset()
      phase.value = 'enroll'
      props.mascot.react('happy')
    } catch (cause) {
      oops()
      if (isStepExpiredError(cause)) {
        emit('expired')
        return
      }
      const key = errorKey(cause, 'recovery')
      if (key === 'errors.RECOVERY_INVALID') keyField.fail(t('auth.recoveryLogin.keyInvalid'))
      else if (key.startsWith('errors.RECOVERY_KEY_')) keyField.fail(t(key))
      else error.value = key
    } finally {
      busy.value = false
      stage.value = null
    }
  }

  // ---------- новая 2FA ----------
  const code = ref('')
  const codeError = ref<string | null>(null)
  /** «Запомнить этот компьютер» — как при обычном входе */
  const remember = ref(false)
  const totpRef = ref<{ focus: () => void } | null>(null)

  // Поле очищаем сами после неверного кода — ошибку при этом не сбрасываем
  watch(code, (value) => {
    if (!value) return
    codeError.value = null
    error.value = null
  })

  async function submitCode(value: string) {
    if (busy.value) return
    const parsed = totpCodeSchema.safeParse(value)
    if (!parsed.success) {
      codeError.value = t('validation.code.format')
      oops()
      return
    }
    busy.value = true
    error.value = null
    try {
      const { currentAuthKey } = await props.pending.resetTotp(parsed.data, remember.value, report)
      props.mascot.react('happy')
      emit('done', currentAuthKey)
    } catch (cause) {
      oops()
      if (cause instanceof AccountFlowCancelledError) {
        emit('cancelled')
        return
      }
      if (isStepExpiredError(cause)) {
        emit('expired')
        return
      }
      const key = errorKey(cause, 'login')
      if (key === 'errors.INVALID_CODE' || key === 'errors.RATE_LIMITED') {
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

  return {
    t,
    phase,
    busy,
    stage,
    error,
    recoveryKey: keyField.value,
    keyError: keyField.error,
    keyRef: keyField.inputRef,
    onKeyBlur,
    submitKey,
    enrollment,
    code,
    codeError,
    remember,
    totpRef,
    submitCode,
    back: () => emit('back'),
  }
}
