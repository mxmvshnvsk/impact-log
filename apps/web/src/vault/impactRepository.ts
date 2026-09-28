import { type Impact, type ImpactRepository, migrateImpact } from '@impact-log/core'
import { decryptJson, encryptJson } from '@impact-log/core/crypto'
import { assertVaultKey, database, type LocalObject } from './db'
import { masterCryptoKey, masterKeyFingerprint, masterKeySnapshot } from './keyring'
import { getObject, listObjects } from './objects'

const KIND = 'impact' as const

/** Расшифровка одного объекта; null — не удалось (чужой MK, повреждение, неизвестная версия схемы) */
export async function decryptImpact(object: LocalObject): Promise<Impact | null> {
  if (object.ciphertext === null) return null
  try {
    const raw = await decryptJson(
      masterCryptoKey(),
      { objectId: object.objectId, kind: KIND },
      object.ciphertext,
    )
    return migrateImpact(raw)
  } catch (error) {
    console.warn('[vault] cannot decrypt object', object.objectId, error)
    return null
  }
}

export async function encryptImpact(impact: Impact): Promise<string> {
  return encryptJson(masterCryptoKey(), { objectId: impact.objectId, kind: KIND }, impact)
}

type WriteTx = {
  abort(): void
  done: Promise<void>
}

/** Ошибка внутри транзакции: откатываем её целиком и отдаём исходную ошибку */
async function rollback(tx: WriteTx, error: unknown): Promise<never> {
  try {
    tx.abort()
  } catch {
    // транзакция уже завершилась
  }
  await tx.done.catch(() => undefined)
  throw error
}

/**
 * Репозиторий записей поверх зашифрованного хранилища. Локальная запись коммитится сразу (dirty=1),
 * синхронизация подхватывает её асинхронно.
 */
export class EncryptedImpactRepository implements ImpactRepository {
  /** Сколько объектов не удалось расшифровать при последнем list() */
  undecryptable = 0

  async list(): Promise<Impact[]> {
    const objects = (await listObjects(KIND)).filter((object) => object.deleted === 0)
    const decrypted = await Promise.all(objects.map(decryptImpact))
    this.undecryptable = decrypted.filter((impact) => impact === null).length
    return decrypted.filter((impact): impact is Impact => impact !== null)
  }

  async get(objectId: string): Promise<Impact | null> {
    const object = await getObject(objectId)
    return object && object.deleted === 0 ? decryptImpact(object) : null
  }

  /**
   * Шифруем заранее: внутри транзакции IndexedDB нельзя ждать не-IDB промисы (она закоммитится).
   * Ключ и его отпечаток берём одним снимком, а в транзакции сверяем отпечаток с записью хранилища:
   * если другая вкладка успела сменить MK, запись старым ключом не пройдёт (VaultChangedError).
   */
  async save(impact: Impact): Promise<void> {
    const { key, id } = masterKeySnapshot()
    const ciphertext = await encryptJson(key, { objectId: impact.objectId, kind: KIND }, impact)
    // Проверка ключа, чтение версии и запись — в одной транзакции (не разойтись с движком синхронизации)
    const tx = (await database()).transaction(['objects', 'meta'], 'readwrite')
    try {
      await assertVaultKey(tx.objectStore('meta'), id)
      const objects = tx.objectStore('objects')
      const existing = await objects.get(impact.objectId)
      await objects.put({
        objectId: impact.objectId,
        kind: KIND,
        ciphertext,
        version: existing?.version ?? 0,
        dirty: 1,
        deleted: 0,
        updatedAt: impact.updatedAt,
      })
    } catch (error) {
      await rollback(tx, error)
    }
    await tx.done
  }

  async remove(objectId: string): Promise<void> {
    const id = masterKeyFingerprint()
    const tx = (await database()).transaction(['objects', 'meta'], 'readwrite')
    try {
      await assertVaultKey(tx.objectStore('meta'), id)
      const objects = tx.objectStore('objects')
      const existing = await objects.get(objectId)
      if (existing) {
        // Сервер о записи ещё не знает — просто удаляем; иначе оставляем tombstone для синхронизации
        if (existing.version === 0) await objects.delete(objectId)
        else
          await objects.put({
            ...existing,
            ciphertext: null,
            deleted: 1,
            dirty: 1,
            updatedAt: new Date().toISOString(),
          })
      }
    } catch (error) {
      await rollback(tx, error)
    }
    await tx.done
  }
}

export const impactRepository = new EncryptedImpactRepository()
