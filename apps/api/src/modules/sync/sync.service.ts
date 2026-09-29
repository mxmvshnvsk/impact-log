import {
  canCreateImpact,
  canStoreObjects,
  PULL_MAX_BYTES,
  type PullResponse,
  type PushChange,
  type PushResult,
  resolveEntitlements,
  type ServerObject,
  type StorageUsage,
} from '@impact-log/shared'
import { and, asc, eq, gt, lte, sql } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { type ObjectRow, objects, users } from '../../db/schema'
import { AppError } from '../../lib/errors'
import {
  countActiveImpacts,
  countObjectRows,
  storageUsage,
  TOMBSTONE_ROW_FACTOR,
} from '../entitlements/usage'

type Deps = { db: Database }

function toServerObject(row: ObjectRow): ServerObject {
  return {
    objectId: row.objectId,
    kind: row.kind,
    version: row.version,
    ciphertext: row.ciphertext,
    deleted: row.deleted,
    seq: row.seq,
    keyEpoch: row.keyEpoch,
  }
}

/** Размер шифротекста в байтах — так же, как считает БД (octet_length) */
function byteLength(ciphertext: string | null): number {
  return ciphertext === null ? 0 : Buffer.byteLength(ciphertext, 'utf8')
}

/**
 * Синхронизация непрозрачных объектов (ADR-0007). Сервер не видит содержимое — только версии,
 * tombstone'ы и порядковые номера изменений.
 */
export function createSyncService({ db }: Deps) {
  /**
   * Изменения после курсора по возрастанию seq. Страница ограничена и числом объектов (limit), и суммой
   * шифротекстов (PULL_MAX_BYTES, но хотя бы один объект). Сначала лёгкий проход — только seq и размер
   * (octet_length не распаковывает TOAST), limit+1 строк, чтобы честно узнать hasMore; затем сами объекты.
   *
   * Между запросами объект страницы может обновиться — тогда у него новый seq больше курсора, и он придёт
   * на следующей странице. Новых объектов с seq ≤ курсора появиться не может: push'и пользователя
   * сериализованы, и каждый получает seq больше всех закоммиченных (см. push).
   */
  async function pull(userId: string, cursor: number, limit: number): Promise<PullResponse> {
    const sizes = await db
      .select({
        seq: objects.seq,
        size: sql<number>`coalesce(octet_length(${objects.ciphertext}), 0)`.mapWith(Number),
      })
      .from(objects)
      .where(and(eq(objects.userId, userId), gt(objects.seq, cursor)))
      .orderBy(asc(objects.seq))
      .limit(limit + 1)

    let taken = 0
    let bytes = 0
    for (const row of sizes) {
      if (taken >= limit || (taken > 0 && bytes + row.size > PULL_MAX_BYTES)) break
      bytes += row.size
      taken++
    }
    const last = sizes[taken - 1]
    if (!last) return { changes: [], cursor, hasMore: false }

    const rows = await db
      .select()
      .from(objects)
      .where(and(eq(objects.userId, userId), gt(objects.seq, cursor), lte(objects.seq, last.seq)))
      .orderBy(asc(objects.seq))
    return {
      changes: rows.map(toServerObject),
      cursor: last.seq,
      hasMore: sizes.length > taken,
    }
  }

  /**
   * Применяет изменения по порядку в одной транзакции. Пуши одного пользователя сериализуются
   * блокировкой его строки в users: так seq внутри пользователя выдаются в порядке коммитов,
   * и pull по курсору не может «перепрыгнуть» ещё не закоммиченное изменение. Та же блокировка
   * делает точными счётчики квот внутри транзакции и сериализует push с commit'ом ротации MK.
   *
   * Эпоха ключа (ADR-0012): keyEpoch изменения больше эпохи аккаунта → INVALID (шифротексты будущей эпохи
   * попадают на сервер только через черновик ротации); шифротекст старой эпохи → STALE_KEY (клиент сначала
   * перешифровывает хранилище новым MK). Tombstone ключа не содержит — его старая эпоха не отклоняется, а
   * записывается эпоха аккаунта.
   */
  async function push(userId: string, changes: PushChange[]): Promise<PushResult[]> {
    return db.transaction(async (tx) => {
      const [owner] = await tx
        .select({ plan: users.plan, keyEpoch: users.keyEpoch })
        .from(users)
        .where(eq(users.id, userId))
        .for('update')
      if (!owner) throw new AppError('UNAUTHORIZED', 401)
      const profile = resolveEntitlements({ planId: owner.plan })
      /** Активные impact и объём хранилища — считаем лениво (один раз) и дальше ведём счётчики */
      let activeImpacts: number | null = null
      let storage: StorageUsage | null = null
      let rows: number | null = null
      const results: PushResult[] = []

      for (const change of changes) {
        const { objectId } = change
        const keyEpoch = change.keyEpoch ?? 1
        if (keyEpoch > owner.keyEpoch) {
          results.push({ objectId, status: 'rejected', code: 'INVALID' })
          continue
        }
        if (change.ciphertext !== null && keyEpoch < owner.keyEpoch) {
          results.push({ objectId, status: 'rejected', code: 'STALE_KEY' })
          continue
        }

        const [existing] = await tx
          .select()
          .from(objects)
          .where(and(eq(objects.userId, userId), eq(objects.objectId, objectId)))
          .for('update')

        // baseVersion > 0 у несуществующего объекта, удаление несуществующего (tombstone «из ничего»
        // только раздувал бы хранилище) и смена kind — некорректные изменения
        const invalid = existing
          ? existing.kind !== change.kind
          : change.baseVersion > 0 || change.ciphertext === null
        if (invalid) {
          results.push({ objectId, status: 'rejected', code: 'INVALID' })
          continue
        }
        if (existing && existing.version !== change.baseVersion) {
          results.push({ objectId, status: 'conflict', server: toServerObject(existing) })
          continue
        }

        // Квота активных impact ограничивает только создание (в т.ч. «воскрешение» tombstone'а).
        const alive = existing !== undefined && !existing.deleted
        const creating = change.ciphertext !== null && !alive
        const removing = change.ciphertext === null && alive
        let impactDelta = 0
        if (change.kind === 'impact' && (creating || removing)) {
          activeImpacts ??= await countActiveImpacts(tx, userId)
          if (creating && !canCreateImpact(profile, activeImpacts).allowed) {
            results.push({ objectId, status: 'rejected', code: 'QUOTA_EXCEEDED' })
            continue
          }
          impactDelta = creating ? 1 : -1
        }

        // Квота хранилища ограничивает только рост: новый живой объект или больше байт.
        // Уменьшение и удаление разрешены всегда; tombstone'ы в число объектов не входят.
        const delta = {
          addBytes: byteLength(change.ciphertext) - byteLength(existing?.ciphertext ?? null),
          addObjects: creating ? 1 : removing ? -1 : 0,
        }
        if (delta.addBytes > 0 || delta.addObjects > 0) {
          storage ??= await storageUsage(tx, userId)
          if (!canStoreObjects(profile, storage, delta).allowed) {
            results.push({ objectId, status: 'rejected', code: 'QUOTA_EXCEEDED' })
            continue
          }
        }

        // Новая строка (в т.ч. будущий tombstone) — под общим потолком строк, чтобы циклы
        // «создать → удалить» не раздували БД: живые объекты ограничены maxObjects, все строки — вдвое больше
        const maxObjects = profile.limits.maxObjects
        if (!existing && maxObjects !== null) {
          rows ??= await countObjectRows(tx, userId)
          if (rows + 1 > maxObjects * TOMBSTONE_ROW_FACTOR) {
            results.push({ objectId, status: 'rejected', code: 'QUOTA_EXCEEDED' })
            continue
          }
        }

        const values = {
          kind: change.kind,
          version: (existing?.version ?? 0) + 1,
          ciphertext: change.ciphertext,
          deleted: change.ciphertext === null,
          keyEpoch: change.ciphertext === null ? owner.keyEpoch : keyEpoch,
          seq: sql<number>`nextval('object_seq')`,
          updatedAt: sql`now()`,
        }
        const returning = { version: objects.version, seq: objects.seq }
        const [written] = existing
          ? await tx
              .update(objects)
              .set(values)
              .where(and(eq(objects.userId, userId), eq(objects.objectId, objectId)))
              .returning(returning)
          : await tx
              .insert(objects)
              .values({ userId, objectId, ...values })
              .returning(returning)
        if (!written) throw new Error('Failed to write object')

        if (rows !== null && !existing) rows += 1
        if (activeImpacts !== null) activeImpacts += impactDelta
        if (storage !== null) {
          storage.storageBytes += delta.addBytes
          storage.objects += delta.addObjects
        }
        results.push({ objectId, status: 'accepted', version: written.version, seq: written.seq })
      }

      return results
    })
  }

  return { pull, push }
}

export type SyncService = ReturnType<typeof createSyncService>
