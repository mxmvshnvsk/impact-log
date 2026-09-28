import { and, eq, isNull, lte, or, sql } from 'drizzle-orm'
import type { Executor } from '../../db/client'
import { users } from '../../db/schema'
import { AppError } from '../../lib/errors'

/**
 * Защита TOTP от перебора — на пользователя, а не на сессию: каждая /login даёт новую second-factor-сессию,
 * а IP можно менять. Счётчик неудач подряд общий для всех мест, где проверяется код (вход, регистрация,
 * перевыпуск 2FA, удаление аккаунта).
 *
 * - После TOTP_MAX_FAILURES неудач подряд — блокировка на 15 минут; каждая следующая неудача
 *   (без успеха между ними) — снова блокировка, вдвое длиннее, не больше суток.
 * - Во время блокировки код не проверяется вовсе: 429 RATE_LIMITED.
 * - Успешный код (и восстановление по Recovery Key) обнуляет счётчик и снимает блокировку.
 *
 * Попытка «резервируется» до проверки кода: атомарный +1 к счётчику (и блокировка, если он дошёл до
 * порога) одним UPDATE с условием «не заблокирован». Поэтому параллельные запросы не проверят больше
 * кодов, чем разрешено, а успех затем обнуляет счётчик (TOTP_SUCCESS_RESET — в том же UPDATE, что
 * фиксирует totp_last_step).
 */
export const TOTP_MAX_FAILURES = 10
const LOCK_BASE_MINUTES = 15
const LOCK_MAX_HOURS = 24
/** 15 мин × 2^7 > 24 ч — дальше степень не растёт (и не переполняется) */
const LOCK_MAX_DOUBLINGS = 7

const failed = users.totpFailedCount
const lockedUntil = users.totpLockedUntil
const nextFailed = sql`${failed} + 1`
const lockInterval = sql`least(
  make_interval(mins => ${sql.raw(String(LOCK_BASE_MINUTES))})
    * power(2, least(${nextFailed} - ${sql.raw(String(TOTP_MAX_FAILURES))}, ${sql.raw(String(LOCK_MAX_DOUBLINGS))})),
  make_interval(hours => ${sql.raw(String(LOCK_MAX_HOURS))})
)`

/** Колонки для UPDATE при успешном коде: счётчик и блокировка сбрасываются */
export const TOTP_SUCCESS_RESET = { totpFailedCount: 0, totpLockedUntil: null } as const

/**
 * Резервирует одну проверку кода для пользователя. Заблокирован → 429 RATE_LIMITED (код не проверяется).
 * Неудача дальше ничего не требует: попытка уже посчитана; успех — TOTP_SUCCESS_RESET.
 */
export async function reserveTotpAttempt(db: Executor, userId: string): Promise<void> {
  const [row] = await db
    .update(users)
    .set({
      totpFailedCount: nextFailed,
      totpLockedUntil: sql`case when ${nextFailed} >= ${sql.raw(String(TOTP_MAX_FAILURES))}
        then now() + ${lockInterval} else null end`,
    })
    .where(and(eq(users.id, userId), or(isNull(lockedUntil), lte(lockedUntil, sql`now()`))))
    .returning({ id: users.id })
  if (!row) throw new AppError('RATE_LIMITED', 429)
}
