import { randomBytes } from 'node:crypto'
import { TOTP_DIGITS } from '@impact-log/shared'
import { encodeBase32UpperCaseNoPadding } from '@oslojs/encoding'
import { createTOTPKeyURI, generateHOTP } from '@oslojs/otp'

const PERIOD_SECONDS = 30
const ISSUER = 'impact log'
/** Допускаем расхождение часов телефона на ±1 шаг (±30 секунд) */
const DRIFT_STEPS = [0, -1, 1] as const

export function generateTotpKey(): Uint8Array {
  return new Uint8Array(randomBytes(20))
}

export function totpEnrollment(key: Uint8Array, login: string) {
  return {
    otpauthUri: createTOTPKeyURI(ISSUER, login, key, PERIOD_SECONDS, TOTP_DIGITS),
    /** Для ручного ввода в приложение-аутентификатор, группами по 4 символа */
    secret:
      encodeBase32UpperCaseNoPadding(key)
        .match(/.{1,4}/g)
        ?.join(' ') ?? '',
  }
}

/**
 * Проверяет код и возвращает номер шага, которым он подошёл, либо null.
 * Код с шагом ≤ lastStep отклоняется — один код нельзя использовать дважды.
 */
export function verifyTotp(
  key: Uint8Array,
  code: string,
  lastStep: number | null,
  now: number = Date.now(),
): number | null {
  const currentStep = Math.floor(now / 1000 / PERIOD_SECONDS)
  for (const drift of DRIFT_STEPS) {
    const step = currentStep + drift
    if (lastStep !== null && step <= lastStep) continue
    if (generateHOTP(key, BigInt(step), TOTP_DIGITS) === code) return step
  }
  return null
}
