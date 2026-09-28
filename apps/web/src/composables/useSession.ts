import type { SessionResponse, User } from '@impact-log/shared'
import { computed, readonly, ref } from 'vue'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/http'

/*
 * Сессия на сервере синхронизации (local-first, ADR-0006/0008). Главное — локальное хранилище (useVault):
 * приложение работает и без сессии. Здесь — только «вошли ли мы на сервер сейчас»:
 * unknown — ещё не проверяли; active — cookie действует; expired — аккаунт привязан, но сессия
 * закончилась (истекла, выход везде, устройство отозвано) → «Войти снова»; none — аккаунта нет.
 * Синглтон модуля (ADR-0002). Router guard сессию больше не проверяет.
 */
export type SessionState = 'unknown' | 'active' | 'expired' | 'none'

const user = ref<User | null>(null)
const deviceId = ref<string | null>(null)
const state = ref<SessionState>('unknown')
let checking: Promise<SessionState> | null = null

export function useSession() {
  function setSession(next: SessionResponse) {
    user.value = next.user
    deviceId.value = next.deviceId
    state.value = 'active'
  }

  function markExpired() {
    user.value = null
    state.value = 'expired'
  }

  function clear() {
    user.value = null
    deviceId.value = null
    state.value = 'none'
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
        checking = null
      })
    return checking
  }

  return {
    user: readonly(user),
    deviceId: readonly(deviceId),
    state: readonly(state),
    isAuthenticated: computed(() => state.value === 'active'),
    setSession,
    markExpired,
    clear,
    refresh,
  }
}
