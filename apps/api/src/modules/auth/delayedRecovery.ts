import {
  RECOVERY_DELAY_HOURS,
  RECOVERY_READY_TTL_DAYS,
  type RecoveryBeginResponse,
  type RecoveryPending,
} from '@impact-log/shared'
import { eq, lt } from 'drizzle-orm'
import type { Executor } from '../../db/client'
import { users } from '../../db/schema'
import { deleteRecoverySessions } from './sessions'

/*
 * Отложенное восстановление (ADR-0008 §8, путь C): Recovery Key без пароля и без 2FA. Отсчёт запускает
 * recovery-сессия (POST /auth/recovery/delay), конверт выдаётся не раньше users.recovery_available_at и не
 * позже RECOVERY_READY_TTL после него. Всё это время вошедшие устройства видят предупреждение
 * (GET /auth/me → recoveryPending) и могут отменить. Время — часы приложения, как у сроков сессий.
 */

const HOUR = 60 * 60 * 1000
export const RECOVERY_DELAY = RECOVERY_DELAY_HOURS * HOUR
export const RECOVERY_READY_TTL = RECOVERY_READY_TTL_DAYS * 24 * HOUR

export type DelayedRecoveryStatus = RecoveryBeginResponse['delayed']

/** Колонки для UPDATE: отложенное восстановление снято */
export const CLEAR_DELAYED_RECOVERY = {
  recoveryStartedAt: null,
  recoveryAvailableAt: null,
} as const

/**
 * none — не начато или истекло (созрело больше RECOVERY_READY_TTL назад); pending — идёт отсчёт;
 * ready — задержка прошла, можно продолжить без 2FA
 */
export function delayedRecoveryStatus(
  availableAt: Date | null,
  now: number = Date.now(),
): DelayedRecoveryStatus {
  if (!availableAt) return { status: 'none' }
  const at = availableAt.getTime()
  if (now < at) return { status: 'pending', availableAt: availableAt.toISOString() }
  if (now <= at + RECOVERY_READY_TTL)
    return { status: 'ready', availableAt: availableAt.toISOString() }
  return { status: 'none' }
}

/** Для GET /auth/me: предупреждение, пока отсчёт идёт или созрел и не истёк */
export function recoveryPendingOf(availableAt: Date | null): RecoveryPending | null {
  const delayed = delayedRecoveryStatus(availableAt)
  return delayed.status === 'none' ? null : { availableAt: delayed.availableAt }
}

/**
 * Запуск отсчёта. Идемпотентно: если отсчёт идёт (или созрел и не истёк) — прежний срок; не начат или
 * истёк — новый (now + RECOVERY_DELAY). Строка пользователя блокируется, чтобы параллельные запуски
 * не перезаписали срок друг другу.
 */
export async function startDelayedRecovery(db: Executor, userId: string): Promise<RecoveryPending> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ availableAt: users.recoveryAvailableAt })
      .from(users)
      .where(eq(users.id, userId))
      .for('update')
    const current = delayedRecoveryStatus(row?.availableAt ?? null)
    if (current.status !== 'none') return { availableAt: current.availableAt }
    const now = Date.now()
    const availableAt = new Date(now + RECOVERY_DELAY)
    await tx
      .update(users)
      .set({ recoveryStartedAt: new Date(now), recoveryAvailableAt: availableAt })
      .where(eq(users.id, userId))
    return { availableAt: availableAt.toISOString() }
  })
}

/**
 * Снять отложенное восстановление и удалить незавершённые действия по Recovery Key (recovery- и
 * totp-reset-сессии): отмена владельцем, смена пароля, перевыпуск Recovery Key
 */
export async function cancelDelayedRecovery(db: Executor, userId: string) {
  await db.update(users).set(CLEAR_DELAYED_RECOVERY).where(eq(users.id, userId))
  await deleteRecoverySessions(db, userId)
}

/** Периодическая уборка: отложенные восстановления, истёкшие после созревания */
export async function cleanupDelayedRecovery(db: Executor) {
  await db
    .update(users)
    .set(CLEAR_DELAYED_RECOVERY)
    .where(lt(users.recoveryAvailableAt, new Date(Date.now() - RECOVERY_READY_TTL)))
}
