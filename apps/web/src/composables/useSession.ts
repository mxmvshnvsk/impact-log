import type { User } from '@impact-log/shared'
import { computed, readonly, ref } from 'vue'
import { authApi } from '@/api/auth'

/*
 * Текущий пользователь — единственное глобальное состояние приложения.
 * Хранится в модуле (синглтон), без Pinia: пока этого достаточно (ADR-0002).
 */
const user = ref<User | null>(null)
let loaded: Promise<void> | null = null

/** Загружает сессию один раз (вызывается из router guard) */
export function ensureSession(): Promise<void> {
  loaded ??= authApi
    .me()
    .then((response) => {
      user.value = response.user
    })
    .catch(() => {
      user.value = null
    })
  return loaded
}

export function useSession() {
  function setUser(next: User | null) {
    user.value = next
    loaded = Promise.resolve()
  }

  async function logout() {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
    }
  }

  return {
    user: readonly(user),
    isAuthenticated: computed(() => user.value !== null),
    setUser,
    logout,
  }
}
