import type {
  ConflictRecord,
  LocalObject,
  StoredEntry,
  SyncCursorState,
  SyncStore,
  Updater,
} from './types'

/** Хранилище в памяти: для проверки движка в node (scripts/sync-e2e.ts) и тестов */
export class MemorySyncStore implements SyncStore {
  readonly objects = new Map<string, LocalObject>()
  readonly conflicts = new Map<string, ConflictRecord>()
  state: SyncCursorState = { cursor: 0, lastSyncAt: null }

  async listDirty(): Promise<LocalObject[]> {
    return [...this.objects.values()].filter((object) => object.dirty === 1).map(clone)
  }

  async listConflicts(): Promise<ConflictRecord[]> {
    return [...this.conflicts.values()].map(clone)
  }

  async read(objectIds: readonly string[]): Promise<Map<string, StoredEntry>> {
    const result = new Map<string, StoredEntry>()
    for (const id of objectIds) {
      const object = this.objects.get(id)
      const conflict = this.conflicts.get(id)
      result.set(id, {
        object: object ? clone(object) : undefined,
        conflict: conflict ? clone(conflict) : undefined,
      })
    }
    return result
  }

  async apply(updates: ReadonlyMap<string, Updater>): Promise<void> {
    for (const [id, update] of updates) {
      const current = this.objects.get(id)
      const conflict = this.conflicts.get(id)
      const decision = update(current && clone(current), conflict && clone(conflict))
      if (decision.object === null) this.objects.delete(id)
      else if (decision.object) this.objects.set(id, clone(decision.object))
      if (decision.conflict === null) this.conflicts.delete(id)
      else if (decision.conflict) this.conflicts.set(id, clone(decision.conflict))
    }
  }

  async readState(): Promise<SyncCursorState> {
    return { ...this.state }
  }

  async writeState(state: SyncCursorState): Promise<void> {
    this.state = { ...state }
  }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}
