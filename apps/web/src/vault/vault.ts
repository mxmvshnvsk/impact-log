import {
  decryptObject,
  generateMasterKey,
  importAeadKey,
  parseEnvelope,
  rewrapObject,
  serializeEnvelope,
  unwrapMasterKey,
  wrapMasterKey,
} from '@impact-log/core/crypto'
import type { KdfParams } from '@impact-log/shared'
import { database, destroyDatabase, type LocalObject, type QuarantineRecord, readMeta } from './db'
import {
  clearMasterKey,
  masterKeyBytes,
  masterKeyId,
  setMasterKey,
  VaultChangedError,
} from './keyring'
import { INITIAL_SYNC_STATE } from './objects'

/*
 * Локальное хранилище (vault) устройства (ADR-0006):
 * — Master Key (MK) случайный, создаётся на устройстве;
 * — на диске MK лежит только в «конверте устройства»: обёрнут неэкспортируемым AES-GCM ключом
 *   (CryptoKey в IndexedDB — его байты не может прочитать даже JS этой страницы);
 * — аккаунт синхронизации опционален: к хранилищу привязываются логин/accountId/deviceId.
 */

export type VaultAccount = {
  userId: string
  accountId: string
  login: string
  deviceId: string
  /** Секрет устройства (выдаётся сервером при создании устройства) — предъявляется вместе с deviceId */
  deviceSecret?: string
}

/**
 * TOFU параметров KDF: соль и параметры Argon2id аккаунта, с которыми на этом устройстве последний раз
 * успешно входили (регистрировались, меняли пароль, восстанавливали доступ). Если prelogin вдруг вернёт
 * более слабые параметры или другую соль — вход спросит подтверждение (ADR-0006 §3).
 */
export type KdfPin = {
  login: string
  kdf: KdfParams
  /** base64url */
  salt: string
}

export type VaultRecord = {
  v: 1
  vaultId: string
  createdAt: string
  /** Сериализованный конверт MK типа device */
  deviceEnvelope: string
  /** Отпечаток MK (masterKeyId): запись объектов сверяет его, чтобы не писать старым ключом после смены */
  mkId?: string
  account: VaultAccount | null
  kdfPin?: KdfPin
}

export class VaultUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('VAULT_UNAVAILABLE', { cause })
  }
}

async function generateDeviceKey(): Promise<CryptoKey> {
  // extractable: false — ключ нельзя выгрузить из браузера, только использовать
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

/** Новый ключ устройства и конверт MK под ним. Ничего не пишет: сохраняет вызывающий, одной транзакцией */
async function sealForDevice(
  masterKey: Uint8Array,
): Promise<{ deviceKey: CryptoKey; envelope: string }> {
  const deviceKey = await generateDeviceKey()
  const envelope = await wrapMasterKey(masterKey, deviceKey, {
    type: 'device',
    kdf: { id: 'none' },
    salt: new Uint8Array(0),
  })
  return { deviceKey, envelope: serializeEnvelope(envelope) }
}

/** Открывает хранилище устройства: null — хранилища нет */
export async function loadVault(): Promise<VaultRecord | null> {
  let record: VaultRecord | undefined
  let deviceKey: CryptoKey | undefined
  try {
    record = await readMeta<VaultRecord>('vault')
    deviceKey = await readMeta<CryptoKey>('deviceKey')
  } catch (error) {
    throw new VaultUnavailableError(error)
  }
  if (!record) return null
  if (!deviceKey) throw new VaultUnavailableError('device key missing')
  const masterKey = await unwrapMasterKey(parseEnvelope(record.deviceEnvelope), deviceKey)
  try {
    const keyId = await masterKeyId(masterKey)
    if (record.mkId && record.mkId !== keyId) throw new VaultUnavailableError('master key mismatch')
    await setMasterKey(masterKey)
    // Хранилище создано до появления отпечатка — дописываем (только если запись за это время не сменилась)
    if (!record.mkId) record = await stampKeyId(record, keyId)
  } finally {
    masterKey.fill(0)
  }
  return record
}

async function stampKeyId(record: VaultRecord, keyId: string): Promise<VaultRecord> {
  const tx = (await database()).transaction('meta', 'readwrite')
  const current = (await tx.store.get('vault')) as VaultRecord | undefined
  let result = record
  if (current && current.vaultId === record.vaultId && !current.mkId) {
    result = { ...current, mkId: keyId }
    await tx.store.put(result, 'vault')
  }
  await tx.done
  return result
}

export type VaultBinding = { account?: VaultAccount | null; kdfPin?: KdfPin }

/** Новое хранилище (онбординг без регистрации или первый вход на устройстве) */
export async function createVault(
  masterKey: Uint8Array = generateMasterKey(),
  binding: VaultBinding = {},
): Promise<VaultRecord> {
  let db: Awaited<ReturnType<typeof database>>
  try {
    db = await database()
  } catch (error) {
    throw new VaultUnavailableError(error)
  }
  const { deviceKey, envelope } = await sealForDevice(masterKey)
  const record: VaultRecord = {
    v: 1,
    vaultId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    deviceEnvelope: envelope,
    mkId: await masterKeyId(masterKey),
    account: binding.account ?? null,
    ...(binding.kdfPin ? { kdfPin: binding.kdfPin } : {}),
  }
  // Ключ устройства и конверт — одной транзакцией: не бывает конверта без ключа и наоборот
  const tx = db.transaction('meta', 'readwrite')
  await Promise.all([
    tx.store.put(deviceKey, 'deviceKey'),
    tx.store.put(record, 'vault'),
    tx.store.put(INITIAL_SYNC_STATE, 'sync'),
    tx.done,
  ])
  await setMasterKey(masterKey)
  masterKey.fill(0)
  return record
}

/** Изменить привязку (аккаунт, TOFU KDF) без смены ключа. Запись читается и пишется одной транзакцией */
export async function updateVaultRecord(
  patch: (record: VaultRecord) => VaultRecord,
): Promise<VaultRecord> {
  const tx = (await database()).transaction('meta', 'readwrite')
  const current = (await tx.store.get('vault')) as VaultRecord | undefined
  if (!current) {
    tx.abort()
    await tx.done.catch(() => undefined)
    throw new VaultChangedError()
  }
  const next = patch(current)
  await tx.store.put(next, 'vault')
  await tx.done
  return next
}

/* ---------------------------------------------------------------- смена MK */

const REKEY_LOCK = 'impact-log:rekey'
const REKEY_ATTEMPTS = 3

/** Смена MK — одна на браузер: вторая вкладка ждёт (без Web Locks — без ожидания) */
function withRekeyLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : null
  if (!locks) return task()
  return locks.request(REKEY_LOCK, task) as Promise<T>
}

export type AdoptOptions = VaultBinding & {
  /** «Стереть записи с устройства и войти»: локальные объекты не переносятся, а удаляются */
  discardLocal?: boolean
}

export type AdoptResult = { record: VaultRecord; moved: number; quarantined: number }

/** Состояние объекта, по которому сверяем снимок с тем, что лежит в базе в момент записи */
const fingerprintOf = (object: LocalObject) =>
  `${object.version}|${object.deleted}|${object.dirty}|${object.ciphertext ?? ''}`

type RekeyPlan = {
  objects: LocalObject[]
  quarantine: QuarantineRecord[]
  snapshot: Map<string, string>
}

/**
 * Всё, что можно посчитать до транзакции: переобёртка DEK новым MK. Объект, который не открывается
 * прежним MK, но уже открывается новым (пришёл из этого же аккаунта), переносится как есть; не
 * открывающийся ни тем, ни другим — в карантин, а не причина провалить смену ключа.
 */
async function planRekey(
  objects: LocalObject[],
  previous: CryptoKey,
  next: CryptoKey,
  previousId: string,
  discard: boolean,
): Promise<RekeyPlan> {
  const snapshot = new Map(objects.map((object) => [object.objectId, fingerprintOf(object)]))
  const plan: RekeyPlan = { objects: [], quarantine: [], snapshot }
  if (discard) return plan
  const now = new Date().toISOString()
  for (const object of objects) {
    // tombstone'ы прежнего аккаунта новому не нужны
    if (object.deleted === 1 || object.ciphertext === null) continue
    const ref = { objectId: object.objectId, kind: object.kind }
    let ciphertext: string | null = null
    try {
      ;(await decryptObject(previous, ref, object.ciphertext)).fill(0)
      ciphertext = await rewrapObject(previous, next, ref, object.ciphertext)
    } catch {
      try {
        ;(await decryptObject(next, ref, object.ciphertext)).fill(0)
        ciphertext = object.ciphertext
      } catch {
        ciphertext = null
      }
    }
    if (ciphertext === null) {
      plan.quarantine.push({
        objectId: object.objectId,
        object,
        reason: 'rekey-undecryptable',
        keyId: previousId,
        quarantinedAt: now,
      })
      continue
    }
    // Для сервера нового аккаунта все объекты — новые
    plan.objects.push({ ...object, ciphertext, version: 0, dirty: 1, deleted: 0 })
  }
  return plan
}

/**
 * Переход на другой MK (регистрация или вход в аккаунт с устройства, где уже есть локальные записи).
 * Атомарно: сначала всё считается в памяти (переобёрнутые объекты, карантин, новый ключ устройства,
 * конверт, запись хранилища, сброс состояния синхронизации), затем ОДНА транзакция на objects,
 * conflicts, meta и quarantine. Сбой до её завершения оставляет хранилище под прежним MK целиком.
 * Если за время подготовки объекты изменились (другая вкладка), транзакция откатывается и подготовка
 * повторяется. MK в памяти меняется только после tx.done.
 */
export function adoptMasterKey(next: Uint8Array, options: AdoptOptions = {}): Promise<AdoptResult> {
  return withRekeyLock(async () => {
    const previous = masterKeyBytes()
    try {
      const db = await database()
      const [previousId, nextId, previousKey, nextKey] = await Promise.all([
        masterKeyId(previous),
        masterKeyId(next),
        importAeadKey(previous),
        importAeadKey(next),
      ])
      for (let attempt = 1; ; attempt++) {
        const record = await readMeta<VaultRecord>('vault')
        // Другая вкладка уже сменила ключ (или стёрла хранилище) — эта работает со старым
        if (!record || (record.mkId && record.mkId !== previousId)) throw new VaultChangedError()
        const plan = await planRekey(
          await db.getAll('objects'),
          previousKey,
          nextKey,
          previousId,
          options.discardLocal === true,
        )
        const { deviceKey, envelope } = await sealForDevice(next)
        const updated: VaultRecord = {
          ...record,
          deviceEnvelope: envelope,
          mkId: nextId,
          account: options.account === undefined ? record.account : options.account,
          ...(options.kdfPin ? { kdfPin: options.kdfPin } : {}),
        }

        const tx = db.transaction(['objects', 'conflicts', 'meta', 'quarantine'], 'readwrite')
        let changed = false
        try {
          const objects = tx.objectStore('objects')
          const meta = tx.objectStore('meta')
          const current = await objects.getAll()
          changed =
            current.length !== plan.snapshot.size ||
            current.some(
              (object) => plan.snapshot.get(object.objectId) !== fingerprintOf(object),
            ) ||
            ((await meta.get('vault')) as VaultRecord | undefined)?.deviceEnvelope !==
              record.deviceEnvelope
          if (changed) throw new VaultChangedError()
          const quarantine = tx.objectStore('quarantine')
          // Любой сбой (в том числе синхронный — например, DataCloneError) откатывает всё разом.
          // У каждого запроса есть обработчик: после отката они отклоняются, но не «висят» в консоли
          const requests: Promise<unknown>[] = []
          const track = (request: Promise<unknown>) => {
            request.catch(() => undefined)
            requests.push(request)
          }
          track(objects.clear())
          if (options.discardLocal) track(quarantine.clear())
          track(tx.objectStore('conflicts').clear())
          for (const object of plan.objects) track(objects.put(object))
          for (const item of plan.quarantine) track(quarantine.put(item))
          track(meta.put(deviceKey, 'deviceKey'))
          track(meta.put(updated, 'vault'))
          track(meta.put(INITIAL_SYNC_STATE, 'sync'))
          await Promise.all(requests)
        } catch (error) {
          try {
            tx.abort()
          } catch {
            // транзакция уже завершилась (прервана самим IndexedDB)
          }
          await tx.done.catch(() => undefined)
          // Объекты изменились за время подготовки — готовим заново (ограниченное число раз)
          if (changed && attempt < REKEY_ATTEMPTS) continue
          throw error
        }
        await tx.done
        await setMasterKey(next)
        return {
          record: updated,
          moved: plan.objects.length,
          quarantined: plan.quarantine.length,
        }
      }
    } finally {
      previous.fill(0)
    }
  })
}

/** Стирает хранилище этого устройства (серверные данные не трогает) */
export async function destroyVault(): Promise<void> {
  clearMasterKey()
  await destroyDatabase()
}
