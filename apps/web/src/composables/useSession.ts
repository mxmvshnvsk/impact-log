import type { MeResponse, RecoveryPending, SessionResponse, User } from '@impact-log/shared'
import { computed, readonly, ref } from 'vue'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/http'

/*
 * Сессия на сервере синхронизации (local-first, ADR-0006/0008). Главное — локальное хранилище (useVault):
 * приложение работает и без сессии. Здесь — только «вошли ли мы на сервер сейчас»:
 * unknown — ещё не проверяли; active — cookie действует; expired — аккаунт привязан, но сессия
 * закончилась (истекла, выход везде, устройство отозвано) → «Войти снова»; none — аккаунта нет.
 * Плюс состояние безопасности из GET /api/auth/me: recoveryPending — кто-то запустил отложенное
 * восстановление по Recovery Key (без пароля и 2FA), вошедшие устройства показывают предупреждение.
 * Синглтон модуля (ADR-0002). Router guard сессию больше не проверяет.
 */
export type SessionState = 'unknown' | 'active' | 'expired' | 'none'

const user = ref<User | null>(null)
const deviceId = ref<string | null>(null)
const state = ref<SessionState>('unknown')
const recoveryPending = ref<RecoveryPending | null>(null)
let checking: Promise<SessionState> | null = null
/** Когда последний раз спрашивали /auth/me (мс) — чтобы не опрашивать чаще нужного */
let checkedAt = 0

export function useSession() {
  function setSession(next: SessionResponse | MeResponse) {
    if (user.value && user.value.id !== next.user.id) recoveryPending.value = null
    user.value = next.user
    deviceId.value = next.deviceId
    state.value = 'active'
    if ('recoveryPending' in next) recoveryPending.value = next.recoveryPending ?? null
  }

  function markExpired() {
    user.value = null
    state.value = 'expired'
    recoveryPending.value = null
  }

  function clear() {
    user.value = null
    deviceId.value = null
    state.value = 'none'
    recoveryPending.value = null
  }

  /** Отложенное восстановление отменено с этого устройства */
  function clearRecoveryPending() {
    recoveryPending.value = null
  }

  /** Проверить cookie сессии (GET /api/auth/me). Сетевая ошибка — состояние не меняем */
  function refresh(): Promise<SessionState> {
    checking ??= authApi
      .me()
      .then((response) => {
        setSession(response)
        return state.value
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) markExpired()
        return state.value
      })
      .finally(() => {
        checkedAt = Date.now()
        checking = null
      })
    return checking
  }

  /** refresh(), если с прошлой проверки прошло не меньше maxAgeMs (фокус окна, периодический опрос) */
  function refreshIfStale(maxAgeMs: number): Promise<SessionState> {
    if (checking) return checking
    if (Date.now() - checkedAt < maxAgeMs) return Promise.resolve(state.value)
    return refresh()
  }

  return {
    user: readonly(user),
    deviceId: readonly(deviceId),
    state: readonly(state),
    recoveryPending: readonly(recoveryPending),
    isAuthenticated: computed(() => state.value === 'active'),
    setSession,
    markExpired,
    clear,
    clearRecoveryPending,
    refresh,
    refreshIfStale,
  }
}
