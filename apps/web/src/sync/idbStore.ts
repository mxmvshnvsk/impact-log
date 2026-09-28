import { assertVaultKey, database } from '../vault/db'
import { masterKeyFingerprint } from '../vault/keyring'
import { readSyncState, writeSyncState } from '../vault/objects'
import type { StoredEntry, SyncStore, Updater } from './types'

/**
 * Адаптер движка к локальному хранилищу (IndexedDB, src/vault). Решения движка применяются в одной
 * readwrite-транзакции на objects + conflicts: внутри нет посторонних await, поэтому IndexedDB
 * не закрывает транзакцию, а сравнение «до/после» (compare-and-set) атомарно относительно правок в UI.
 * В той же транзакции сверяется отпечаток MK (meta.vault): если другая вкладка сменила ключ хранилища,
 * решения этой вкладки не применяются (VaultChangedError).
 */
export const idbSyncStore: SyncStore = {
  async listDirty() {
    return (await database()).getAllFromIndex('objects', 'dirty', 1)
  },

  async listConflicts() {
    return (await database()).getAll('conflicts')
  },

  async read(objectIds) {
    const result = new Map<string, StoredEntry>()
    if (objectIds.length === 0) return result
    const tx = (await database()).transaction(['objects', 'conflicts'], 'readonly')
    const objects = tx.objectStore('objects')
    const conflicts = tx.objectStore('conflicts')
    await Promise.all(
      objectIds.map(async (id) => {
        const [object, conflict] = await Promise.all([objects.get(id), conflicts.get(id)])
        result.set(id, { object, conflict })
      }),
    )
    await tx.done
    return result
  },

  async apply(updates: ReadonlyMap<string, Updater>) {
    if (updates.size === 0) return
    const keyId = masterKeyFingerprint()
    const tx = (await database()).transaction(['objects', 'conflicts', 'meta'], 'readwrite')
    const objects = tx.objectStore('objects')
    const conflicts = tx.objectStore('conflicts')
    try {
      await assertVaultKey(tx.objectStore('meta'), keyId)
      for (const [id, update] of updates) {
        const [current, conflict] = await Promise.all([objects.get(id), conflicts.get(id)])
        const decision = update(current, conflict)
        if (decision.object === null) await objects.delete(id)
        else if (decision.object) await objects.put(decision.object)
        if (decision.conflict === null) await conflicts.delete(id)
        else if (decision.conflict) await conflicts.put(decision.conflict)
      }
    } catch (error) {
      tx.abort()
      await tx.done.catch(() => undefined)
      throw error
    }
    await tx.done
  },

  readState: readSyncState,
  writeState: writeSyncState,
}
