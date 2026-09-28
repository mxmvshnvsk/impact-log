import type { StorageUsage } from '@impact-log/shared'
import { and, count, eq, isNull, sql } from 'drizzle-orm'
import type { Executor } from '../../db/client'
import { devices, objects } from '../../db/schema'

/** Активные записи — не удалённые impact (квота считает их, а не «создано за всё время») */
export async function countActiveImpacts(db: Executor, userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(objects)
    .where(and(eq(objects.userId, userId), eq(objects.kind, 'impact'), eq(objects.deleted, false)))
  return row?.value ?? 0
}

/** Не отозванные устройства */
export async function countDevices(db: Executor, userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(devices)
    .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)))
  return row?.value ?? 0
}

/**
 * Серверное хранилище пользователя: сумма байт шифротекстов и число ЖИВЫХ объектов. Tombstone'ы
 * в лимит не входят (ADR-0005: квота — по активным данным, а не «создано за всё время»); tombstone
 * без живого объекта сервер не принимает, так что их число ограничено числом удалений.
 * octet_length не распаковывает TOAST — размер берётся из заголовка значения.
 */
export async function storageUsage(db: Executor, userId: string): Promise<StorageUsage> {
  const [row] = await db
    .select({
      objects: sql<number>`count(*) filter (where not ${objects.deleted})`.mapWith(Number),
      storageBytes: sql<number>`coalesce(sum(octet_length(${objects.ciphertext})), 0)`.mapWith(
        Number,
      ),
    })
    .from(objects)
    .where(eq(objects.userId, userId))
  return { objects: row?.objects ?? 0, storageBytes: row?.storageBytes ?? 0 }
}
