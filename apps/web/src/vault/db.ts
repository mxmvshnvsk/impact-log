import type { ObjectKind } from '@impact-log/shared'
import { type DBSchema, deleteDB, type IDBPDatabase, openDB } from 'idb'
import { VaultChangedError } from './keyring'

/*
 * Локальное хранилище (IndexedDB). Содержимое записей лежит ТОЛЬКО в зашифрованном виде — тем же форматом,
 * что уходит на сервер (core/crypto encryptObject), поэтому синхронизация не перешифровывает данные.
 */
export const DB_NAME = 'impact-log'
/** v2 — хранилище quarantine (объекты, которые не удалось переобернуть при смене MK) */
const DB_VERSION = 2

/** Зашифрованный объект на устройстве */
export type LocalObject = {
  objectId: string
  kind: ObjectKind
  /** Шифротекст (JSON {v,alg,k,c}); null — tombstone (удаление, ещё не отправленное на сервер) */
  ciphertext: string | null
  /** Последняя известная серверная версия; 0 — объект ещё ни разу не синхронизирован */
  version: number
  /** 1 — есть локальные изменения, которые нужно отправить (числа, т.к. boolean не индексируется) */
  dirty: 0 | 1
  deleted: 0 | 1
  updatedAt: string
}

/** Конфликт синхронизации: локальная версия осталась в objects, серверная — здесь. Ничего не теряем */
export type ConflictRecord = {
  objectId: string
  kind: ObjectKind
  server: { version: number; ciphertext: string | null; deleted: boolean }
  detectedAt: string
}

/**
 * Карантин: объект не расшифровался прежним MK при смене ключа хранилища (повреждение, чужой ключ).
 * Смена MK не падает из-за одного такого объекта — он откладывается сюда как есть (шифротекст под
 * прежним ключом) и в синхронизацию не попадает. Только на этом устройстве.
 */
export type QuarantineRecord = {
  objectId: string
  object: LocalObject
  reason: 'rekey-undecryptable'
  /** Отпечаток MK, которым объект не удалось открыть */
  keyId: string | null
  quarantinedAt: string
}

export type MetaKey = 'vault' | 'deviceKey' | 'sync' | 'captures'

interface VaultSchema extends DBSchema {
  meta: { key: MetaKey; value: unknown }
  objects: { key: string; value: LocalObject; indexes: { dirty: number } }
  conflicts: { key: string; value: ConflictRecord }
  quarantine: { key: string; value: QuarantineRecord }
}

export type VaultDatabase = IDBPDatabase<VaultSchema>

let connection: Promise<VaultDatabase> | null = null

export function database(): Promise<VaultDatabase> {
  connection ??= openDB<VaultSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('meta')
        const objects = db.createObjectStore('objects', { keyPath: 'objectId' })
        objects.createIndex('dirty', 'dirty')
        db.createObjectStore('conflicts', { keyPath: 'objectId' })
      }
      if (oldVersion < 2) db.createObjectStore('quarantine', { keyPath: 'objectId' })
    },
    // Другая вкладка удаляет базу (стирание данных) или обновляет её схему — отпускаем соединение
    blocking() {
      void connection?.then((db) => db.close())
      connection = null
    },
    terminated() {
      connection = null
    },
  })
  return connection
}

export async function readMeta<T>(key: MetaKey): Promise<T | undefined> {
  return (await (await database()).get('meta', key)) as T | undefined
}

export async function writeMeta(key: MetaKey, value: unknown): Promise<void> {
  await (await database()).put('meta', value, key)
}

/**
 * Проверка внутри транзакции записи: хранилище всё ещё под тем MK, которым зашифровано то, что пишем.
 * Другая вкладка могла сменить MK (вход в аккаунт) — тогда запись старым ключом недопустима.
 * Записи хранилища без отпечатка (созданные до его появления) не мешают: отпечаток дописывает loadVault.
 */
export async function assertVaultKey(
  meta: { get(key: 'vault'): Promise<unknown> },
  keyId: string,
): Promise<void> {
  const record = (await meta.get('vault')) as { mkId?: string } | undefined
  if (!record || (record.mkId !== undefined && record.mkId !== keyId)) {
    throw new VaultChangedError()
  }
}

/** Полностью удаляет базу этого устройства */
export async function destroyDatabase(): Promise<void> {
  if (connection) {
    const db = await connection.catch(() => null)
    db?.close()
    connection = null
  }
  await deleteDB(DB_NAME)
}
