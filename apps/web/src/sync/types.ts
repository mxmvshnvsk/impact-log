import type { PullResponse, PushChange, PushResponse } from '@impact-log/shared'
import type { ConflictRecord, LocalObject } from '../vault/db'

/*
 * Контракты движка синхронизации. Ядро (engine.ts) не знает ни про Vue, ни про IndexedDB, ни про fetch:
 * хранилище и транспорт — адаптеры. Так один и тот же алгоритм работает в браузере и в node-проверке.
 */
export type { ConflictRecord, LocalObject }

/** Решение по одному objectId: undefined — не трогать, null — удалить */
export type Decision = {
  object?: LocalObject | null
  conflict?: ConflictRecord | null
}

/**
 * Синхронная функция «прочитал текущее → решил». Хранилище вызывает её внутри одной транзакции,
 * поэтому решение принимается по актуальному состоянию (compare-and-set): пользователь мог изменить запись,
 * пока шёл сетевой запрос. Updater'ы одного apply вызываются последовательно в порядке вставки в Map.
 */
export type Updater = (
  current: LocalObject | undefined,
  conflict: ConflictRecord | undefined,
) => Decision

export type SyncCursorState = {
  /** seq последнего применённого серверного изменения */
  cursor: number
  lastSyncAt: string | null
}

export type StoredEntry = { object?: LocalObject; conflict?: ConflictRecord }

export interface SyncStore {
  listDirty(): Promise<LocalObject[]>
  listConflicts(): Promise<ConflictRecord[]>
  read(objectIds: readonly string[]): Promise<Map<string, StoredEntry>>
  /** Атомарно применить решения (одна транзакция на objects + conflicts) */
  apply(updates: ReadonlyMap<string, Updater>): Promise<void>
  readState(): Promise<SyncCursorState>
  writeState(state: SyncCursorState): Promise<void>
}

/**
 * Транспорт. Ошибки HTTP — исключения с числовым полем `status` (0 — сеть недоступна) и, по возможности,
 * `code` из ERROR_CODES (как ApiError в src/api/http.ts).
 */
export interface SyncTransport {
  pull(cursor: number, limit: number): Promise<PullResponse>
  push(changes: PushChange[]): Promise<PushResponse>
}

export function httpStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status
    return typeof status === 'number' ? status : undefined
  }
  return undefined
}

export function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'string') return code
  }
  return error instanceof Error ? error.message : 'UNKNOWN_ERROR'
}
