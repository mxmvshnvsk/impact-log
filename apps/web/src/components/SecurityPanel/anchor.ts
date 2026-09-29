/** Действия раздела «Безопасность» (Настройки → Аккаунт) */
export type SecurityAction = 'password' | 'recoveryKey' | 'totp' | 'keyRotation'

/**
 * Якорь строки раздела (#security-recoveryKey): ссылка на него открывает нужную форму сразу.
 * Отдельный модуль — чтобы ссылаться из других мест, не подтягивая сам раздел в бандл.
 */
export function securityAnchor(action: SecurityAction): string {
  return `security-${action}`
}
