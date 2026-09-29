import { RECOVERY_DELAY_HOURS, RECOVERY_READY_TTL_DAYS, totpCodeSchema } from '@impact-log/shared'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorKey, isStepExpiredError, recoveryNotReadyUntil } from '@/account'
import type { AccountStage, PendingRecovery } from '@/composables/useAccount'
import type { Mascot } from '@/composables/useMascot'
import { formatAvailableAt } from '@/utils/availableAt'

/**
 * code — код из приложения 2FA (путь A, по умолчанию); explain — «нет доступа к 2FA»: честно о задержке;
 * started — отсчёт только что запущен; pending — отсчёт уже идёт (вернулись раньше срока);
 * ready — задержка прошла, можно продолжить без 2FA (путь C).
 */
export type RecoveryFactorPhase = 'code' | 'explain' | 'started' | 'pending' | 'ready'

export type RecoveryFactorProps = {
  recovery: PendingRecovery
  mascot: Pick<Mascot, 'focus' | 'blur' | 'react'>
}

export type RecoveryFactorEmits = {
  /** MK открыт — можно задавать новый пароль */
  unlocked: []
  /** Recovery-сессия сгорела — начинать с Recovery Key заново */
  expired: []
  phase: [phase: RecoveryFactorPhase]
}

type Emit = ((event: 'unlocked') => void) &
  ((event: 'expired') => void) &
  ((event: 'phase', phase: RecoveryFactorPhase) => void)

const DAY_MS = 86_400_000
const TICK_MS = 30_000

function initialPhase(recovery: PendingRecovery): RecoveryFactorPhase {
  if (recovery.delayed.status === 'ready') return 'ready'
  if (recovery.delayed.status === 'pending') return 'pending'
  return 'code'
}

/**
 * Второй фактор восстановления (ADR-0008 §7): Recovery Key уже проверен. С кодом 2FA — сразу;
 * без него — только через RECOVERY_DELAY_HOURS, и всё это время вошедшие устройства видят предупреждение.
 */
export function useRecoveryFactor(props: RecoveryFactorProps, emit: Emit) {
  const { t, locale } = useI18n()
  const phase = ref<RecoveryFactorPhase>(initialPhase(props.recovery))
  const availableAt = ref<string | null>(
    props.recovery.delayed.status === 'none' ? null : props.recovery.delayed.availableAt,
  )
  const busy = ref(false)
  const stage = ref<AccountStage | null>(null)
  const error = ref<string | null>(null)
  const report = (next: AccountStage) => {
    stage.value = next
  }

  watch(phase, (next) => emit('phase', next), { immediate: true })

  function go(next: RecoveryFactorPhase) {
    error.value = null
    codeError.value = null
    phase.value = next
  }

  /** «через N часов» пересчитываем, пока экран открыт */
  const now = ref(Date.now())
  const ticker = setInterval(() => {
    now.value = Date.now()
  }, TICK_MS)
  onBeforeUnmount(() => clearInterval(ticker))

  const when = computed(() =>
    availableAt.value ? formatAvailableAt(availableAt.value, locale.value, now.value) : null,
  )
  /** До какого момента отложенное восстановление можно продолжить (срок + RECOVERY_READY_TTL_DAYS) */
  const readyUntil = computed(() => {
    if (!availableAt.value) return null
    const until = new Date(Date.parse(availableAt.value) + RECOVERY_READY_TTL_DAYS * DAY_MS)
    return formatAvailableAt(until.toISOString(), locale.value, now.value).date
  })

  function fail(cause: unknown): void {
    props.mascot.react('oops')
    if (isStepExpiredError(cause)) {
      emit('expired')
      return
    }
    error.value = errorKey(cause, 'recovery')
  }

  // ---------- A: код 2FA ----------
  const code = ref('')
  const codeError = ref<string | null>(null)
  const otpRef = ref<{ focus: () => void } | null>(null)

  // Поле очищаем сами после неверного кода — ошибку при этом не сбрасываем
  watch(code, (value) => {
    if (!value) return
    codeError.value = null
    error.value = null
  })

  async function submitCode(value?: unknown) {
    if (busy.value) return
    const parsed = totpCodeSchema.safeParse(typeof value === 'string' ? value : code.value)
    if (!parsed.success) {
      codeError.value = t('validation.code.format')
      props.mascot.react('oops')
      return
    }
    busy.value = true
    error.value = null
    try {
      await props.recovery.verify(parsed.data, report)
      props.mascot.react('happy')
      emit('unlocked')
    } catch (cause) {
      const key = errorKey(cause, 'recovery')
      if (key === 'errors.INVALID_CODE' || key === 'errors.RATE_LIMITED') {
        props.mascot.react('oops')
        codeError.value =
          key === 'errors.RATE_LIMITED' ? t('auth.recoverFactor.codeLocked') : t(key)
        code.value = ''
        otpRef.value?.focus()
      } else {
        fail(cause)
      }
    } finally {
      busy.value = false
      stage.value = null
    }
  }

  // ---------- C: без второго фактора — через 48 часов ----------
  async function startDelay() {
    if (busy.value) return
    busy.value = true
    error.value = null
    try {
      const pending = await props.recovery.startDelay()
      availableAt.value = pending.availableAt
      go('started')
      props.mascot.react('happy')
    } catch (cause) {
      fail(cause)
    } finally {
      busy.value = false
    }
  }

  async function resume() {
    if (busy.value) return
    busy.value = true
    error.value = null
    try {
      await props.recovery.resume(report)
      props.mascot.react('happy')
      emit('unlocked')
    } catch (cause) {
      const until = recoveryNotReadyUntil(cause)
      if (until === undefined) {
        fail(cause)
      } else if (until) {
        // Сервер считает, что срок ещё не наступил (часы устройства спешат) — ждём его срока
        availableAt.value = until
        go('pending')
        props.mascot.react('oops')
      } else {
        // Отложенное восстановление отменили с вошедшего устройства или оно истекло
        availableAt.value = null
        go('explain')
        error.value = 'auth.recoverFactor.notStarted'
        props.mascot.react('oops')
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
    code,
    codeError,
    otpRef,
    when,
    readyUntil,
    delayHours: RECOVERY_DELAY_HOURS,
    readyDays: RECOVERY_READY_TTL_DAYS,
    go,
    submitCode,
    startDelay,
    resume,
  }
}
