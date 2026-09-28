import { CryptoError, RecoveryKeyError } from '@impact-log/core/crypto'
import { ApiError } from '@/api/http'
import { VaultChangedError, VaultLockedError, VaultUnavailableError } from '@/vault'
import { KdfError } from './kdf'
import { KdfLimitError, WrongPasswordError } from './keys'

/** Где случилась ошибка — один и тот же код API значит разное в разных сценариях */
export type ErrorContext = 'login' | 'reauth' | 'recovery'

/**
 * Любая ошибка аккаунтных флоу → ключ i18n (errors.*). Тексты — только на фронте, подробностей
 * криптографических ошибок не раскрываем.
 */
export function errorKey(error: unknown, context?: ErrorContext): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_CREDENTIALS') {
      // 403 — повторное подтверждение паролем в /api/account/*: сессия жива, неверен только пароль
      if (context === 'reauth' || error.status === 403) return 'errors.WRONG_PASSWORD'
      if (context === 'recovery') return 'errors.RECOVERY_INVALID'
    }
    return `errors.${error.code}`
  }
  if (error instanceof RecoveryKeyError) {
    return error.reason === 'checksum'
      ? 'errors.RECOVERY_KEY_CHECKSUM'
      : 'errors.RECOVERY_KEY_FORMAT'
  }
  if (error instanceof WrongPasswordError) return 'errors.WRONG_PASSWORD'
  if (error instanceof CryptoError) {
    return context === 'recovery' ? 'errors.RECOVERY_INVALID' : 'errors.DECRYPT_FAILED'
  }
  if (error instanceof KdfError) return 'errors.KDF_FAILED'
  if (error instanceof KdfLimitError) return 'errors.KDF_LIMIT'
  if (error instanceof VaultChangedError) return 'errors.VAULT_CHANGED'
  if (error instanceof VaultUnavailableError) return 'errors.VAULT_UNAVAILABLE'
  if (error instanceof VaultLockedError) return 'errors.VAULT_LOCKED'
  return 'errors.UNKNOWN_ERROR'
}

/** Сессия на сервере закончилась (или устройство отозвано) — нужно войти снова */
export function isSignedOutError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 401 &&
    (error.code === 'UNAUTHORIZED' || error.code === 'DEVICE_REVOKED')
  )
}

/** Сессия второго шага (код 2FA, восстановление) сгорела — начинать заново */
export function isStepExpiredError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'SESSION_EXPIRED' || (error.status === 401 && error.code === 'UNAUTHORIZED'))
  )
}
