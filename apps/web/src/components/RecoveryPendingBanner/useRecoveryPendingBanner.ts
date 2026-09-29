import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RouteLocationRaw } from 'vue-router'
import { errorKey } from '@/account'
import { securityAnchor } from '@/components/SecurityPanel/anchor'
import { useAccount } from '@/composables/useAccount'
import { formatAvailableAt } from '@/utils/availableAt'

/** Опрос /auth/me, пока вкладка видима */
const POLL_MS = 5 * 60_000
/** Фокус окна / возврат на вкладку — не чаще раза в минуту */
const FOCUS_MIN_MS = 60_000
/** Тик: пересчёт «через N часов» и проверка, не пора ли опросить */
const TICK_MS = 60_000

/**
 * Предупреждение об отложенном восстановлении (ADR-0008 §7): кто-то ввёл Recovery Key без пароля и 2FA
 * и запустил отсчёт. Почты у нас нет — предупреждаем только здесь, на вошедших устройствах.
 * Состояние — из GET /api/auth/me (useSession: при старте его уже спрашивает bootstrapAccount);
 * дальше — раз в 5 минут, пока вкладка видима, и при фокусе окна. Без аккаунта ничего не запрашиваем.
 */
export function useRecoveryPendingBanner() {
  const { t, locale } = useI18n()
  const accountFlow = useAccount()
  const session = accountFlow.session

  /** Только вошедшее устройство: локальный режим и «Войти снова» на сервер не ходят */
  const active = computed(() => accountFlow.mode.value === 'signed-in')
  const pending = computed(() => (active.value ? session.recoveryPending.value : null))

  const now = ref(Date.now())
  const when = computed(() =>
    pending.value ? formatAvailableAt(pending.value.availableAt, locale.value, now.value) : null,
  )

  function check(maxAgeMs: number) {
    if (!active.value || document.visibilityState !== 'visible') return
    void session.refreshIfStale(maxAgeMs)
  }

  const onFocus = () => check(FOCUS_MIN_MS)
  const onVisibility = () => check(FOCUS_MIN_MS)
  let ticker: ReturnType<typeof setInterval> | undefined

  onMounted(() => {
    ticker = setInterval(() => {
      now.value = Date.now()
      check(POLL_MS)
    }, TICK_MS)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
  })
  onBeforeUnmount(() => {
    clearInterval(ticker)
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onVisibility)
  })
  // Появилась сессия (старт, только что вошли) — узнать состояние сразу, не дожидаясь опроса
  watch(active, (value) => value && check(FOCUS_MIN_MS), { immediate: true })

  // ---------- отмена ----------
  const confirmOpen = ref(false)
  const cancelling = ref(false)
  const cancelError = ref<string | null>(null)
  /** Отменили — предлагаем перевыпустить Recovery Key (он всё ещё действует) */
  const cancelled = ref(false)

  function askCancel() {
    cancelError.value = null
    confirmOpen.value = true
  }

  function closeConfirm() {
    if (!cancelling.value) confirmOpen.value = false
  }

  async function confirmCancel() {
    if (cancelling.value) return
    cancelling.value = true
    cancelError.value = null
    try {
      await accountFlow.cancelDelayedRecovery()
      confirmOpen.value = false
      cancelled.value = true
    } catch (cause) {
      cancelError.value = errorKey(cause)
    } finally {
      cancelling.value = false
    }
  }

  function dismiss() {
    cancelled.value = false
  }

  /** Настройки → Безопасность, сразу с открытой формой перевыпуска Recovery Key */
  const reissueTo: RouteLocationRaw = {
    name: 'settings-account',
    hash: `#${securityAnchor('recoveryKey')}`,
  }

  return {
    t,
    pending,
    when,
    confirmOpen,
    cancelling,
    cancelError,
    cancelled,
    askCancel,
    closeConfirm,
    confirmCancel,
    dismiss,
    reissueTo,
  }
}
