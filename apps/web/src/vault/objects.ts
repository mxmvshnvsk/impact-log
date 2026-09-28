import {
  type ConflictRecord,
  database,
  type LocalObject,
  type QuarantineRecord,
  readMeta,
  writeMeta,
} from './db'

/*
 * Доступ к зашифрованным объектам и состоянию синхронизации. Никакой криптографии здесь нет —
 * только хранение шифротекстов и служебных полей (версия, dirty, tombstone).
 */

export async function listObjects(kind?: LocalObject['kind']): Promise<LocalObject[]> {
  const all = await (await database()).getAll('objects')
  return kind ? all.filter((object) => object.kind === kind) : all
}

export async function getObject(objectId: string): Promise<LocalObject | undefined> {
  return (await database()).get('objects', objectId)
}

/** Объекты с неотправленными изменениями (включая tombstone'ы) */
export async function listDirty(): Promise<LocalObject[]> {
  return (await database()).getAllFromIndex('objects', 'dirty', 1)
}

export async function countActive(kind: LocalObject['kind']): Promise<number> {
  return (await listObjects(kind)).filter((object) => object.deleted === 0).length
}

/* ---------- конфликты ---------- */

export async function listConflicts(): Promise<ConflictRecord[]> {
  return (await database()).getAll('conflicts')
}

export async function putConflict(conflict: ConflictRecord): Promise<void> {
  await (await database()).put('conflicts', conflict)
}

export async function deleteConflict(objectId: string): Promise<void> {
  await (await database()).delete('conflicts', objectId)
}

/* ---------- карантин ---------- */

/** Сколько объектов отложено в карантин при смене MK (не расшифровались) */
export async function countQuarantined(): Promise<number> {
  return (await database()).count('quarantine')
}

/** Все объекты карантина как есть (шифротекст под прежним MK) — чтобы скачать их файлом */
export async function listQuarantine(): Promise<QuarantineRecord[]> {
  return (await database()).getAll('quarantine')
}

/** Удалить карантин на этом устройстве. Объекты в синхронизацию не попадали — на сервере ничего не меняется */
export async function clearQuarantine(): Promise<void> {
  await (await database()).clear('quarantine')
}

/* ---------- состояние синхронизации ---------- */

export type SyncState = {
  /** Курсор pull (seq последнего применённого серверного изменения) */
  cursor: number
  lastSyncAt: string | null
}

export const INITIAL_SYNC_STATE: SyncState = { cursor: 0, lastSyncAt: null }

export async function readSyncState(): Promise<SyncState> {
  return (await readMeta<SyncState>('sync')) ?? INITIAL_SYNC_STATE
}

export async function writeSyncState(state: SyncState): Promise<void> {
  await writeMeta('sync', state)
}
