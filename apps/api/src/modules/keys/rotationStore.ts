import type { KeyRotation } from '@impact-log/shared'
import { and, count, eq } from 'drizzle-orm'
import type { Executor } from '../../db/client'
import { type KeyRotationRow, keyRotations, rotationObjects } from '../../db/schema'

/*
 * Хранилище идущей ротации Master Key (ADR-0012) — только работа с БД, без проверок доступа.
 * Отдельно от rotation.service.ts: отмену ротации вызывают auth и account (смена пароля, перевыпуск
 * Recovery Key, восстановление), а сервис ротации сам зависит от auth — так нет циклических импортов.
 */

/** Сколько объектов уже в черновике */
export async function countStaged(db: Executor, userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(rotationObjects)
    .where(eq(rotationObjects.userId, userId))
  return row?.value ?? 0
}

/** Строка ротации → keyRotationSchema (GET /api/keys, ответ start, details у ROTATION_IN_PROGRESS) */
export function toKeyRotation(row: KeyRotationRow, staged: number): KeyRotation {
  return {
    targetEpoch: row.targetEpoch,
    startedAt: row.startedAt.toISOString(),
    deviceId: row.deviceId,
    staged,
  }
}

/**
 * Отменить ротацию пользователя, если она идёт: строка ротации удаляется, черновик — каскадом.
 * Вызывается в транзакциях, после которых конверты ротации стали бы неверными: смена пароля (password-конверт
 * ротации сделан старым KEK), перевыпуск Recovery Key и восстановление доступа (пользователь сменил
 * ключи — commit подменил бы их конвертами, выпущенными до этого), отзыв устройства-инициатора
 */
export async function cancelRotation(db: Executor, userId: string) {
  await db.delete(keyRotations).where(eq(keyRotations.userId, userId))
}

/** Отзыв устройства-инициатора: ротацию больше некому завершить — отменяем */
export async function cancelRotationOfDevice(db: Executor, userId: string, deviceId: string) {
  await db
    .delete(keyRotations)
    .where(and(eq(keyRotations.userId, userId), eq(keyRotations.deviceId, deviceId)))
}
