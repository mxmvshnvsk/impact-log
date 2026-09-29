import {
  decryptObject,
  encryptObject,
  generateMasterKey,
  importAeadKey,
  parseEnvelope,
  rewrapObject,
  serializeEnvelope,
  unwrapMasterKey,
  wrapMasterKey,
} from '@impact-log/core/crypto'
import type { KdfParams } from '@impact-log/shared'
import {
  type ConflictRecord,
  database,
  destroyDatabase,
  type LocalObject,
  type QuarantineRecord,
  readMeta,
} from './db'
import {
  clearMasterKey,
  masterKeyBytes,
  masterKeyFingerprint,
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
  /**
   * Эпоха ключа аккаунта (ADR-0012), под которым сейчас хранилище: уходит с каждым push, а pull объекта
   * более новой эпохи останавливает синхронизацию (ключ сменили на другом устройстве). Нет поля — 1.
   */
  keyEpoch?: number
}

/**
 * Незавершённая ротация MK, начатая на этом устройстве (ADR-0012): новый MK обёрнут ключом устройства —
 * так же, как основной, — чтобы продолжить после перезагрузки без пароля (конверты уже на сервере).
 * Удаляется, как только ротация завершена (в той же транзакции, что и переход на новый MK) или отменена.
 */
export type PendingRotation = {
  targetEpoch: number
  startedAt: string
  /** Сериализованный конверт нового MK типа device (под тем же ключом устройства, что и основной) */
  deviceEnvelope: string
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
  pendingRotation?: PendingRotation
}

/** Эпоха ключа, под которым хранилище (1 — хранилища, созданные до ротаций) */
export function vaultKeyEpoch(record: Pick<VaultRecord, 'account'> | null | undefined): number {
  return record?.account?.keyEpoch ?? 1
}

/** Хранилище на устройстве уже есть (например, не открылось из-за сбоя) — создавать поверх нельзя */
export class VaultExistsError extends Error {
  constructor() {
    super('VAULT_EXISTS')
  }
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

async function readVaultMeta(): Promise<{ record?: VaultRecord; deviceKey?: CryptoKey }> {
  // Запись и ключ устройства — одной транзакцией: смена MK в другой вкладке не вклинится между чтениями
  const tx = (await database()).transaction('meta', 'readonly')
  const [record, deviceKey] = await Promise.all([
    tx.store.get('vault') as Promise<VaultRecord | undefined>,
    tx.store.get('deviceKey') as Promise<CryptoKey | undefined>,
    tx.done,
  ])
  return { record, deviceKey }
}

async function openVault(): Promise<VaultRecord | null> {
  let record: VaultRecord | undefined
  let deviceKey: CryptoKey | undefined
  try {
    ;({ record, deviceKey } = await readVaultMeta())
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

/** Открывает хранилище устройства: null — хранилища нет. Одна повторная попытка — на случай гонки/сбоя чтения */
export async function loadVault(): Promise<VaultRecord | null> {
  try {
    return await openVault()
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 150))
    return openVault()
  }
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
  // Ключ устройства и конверт — одной транзакцией: не бывает конверта без ключа и наоборот.
  // Существующее хранилище никогда не перезаписываем: иначе прежний MK (и все записи) пропал бы навсегда
  const tx = db.transaction('meta', 'readwrite')
  if (await tx.store.get('vault')) {
    tx.abort()
    await tx.done.catch(() => {})
    throw new VaultExistsError()
  }
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
        // Черновик ротации прежнего MK новому ключу не нужен (и обёрнут прежним ключом устройства)
        const { pendingRotation: _dropped, ...rest } = record
        const updated: VaultRecord = {
          ...rest,
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

/* ------------------------------------------------------- ротация MK (ADR-0012) */

export type RekeyOptions = VaultBinding

export type RekeyResult = { record: VaultRecord; rekeyed: number; quarantined: number }

/** Серверная ветка конфликта — чтобы сверить снимок с базой в момент записи */
const conflictFingerprintOf = (conflict: ConflictRecord) =>
  `${conflict.server.version}|${conflict.server.deleted}|${conflict.server.ciphertext ?? ''}`

/**
 * Перешифровка одного шифротекста новым MK: расшифровать прежним → зашифровать новым со СВЕЖИМ DEK
 * (переобёртка DEK не годится — прежний DEK мог утечь вместе с устройством). Уже открывающийся новым MK —
 * как есть; не открывающийся ни тем, ни другим — null.
 */
async function reencrypt(
  previous: CryptoKey,
  next: CryptoKey,
  ref: { objectId: string; kind: string },
  ciphertext: string,
): Promise<string | null> {
  let plaintext: Uint8Array
  try {
    plaintext = await decryptObject(previous, ref, ciphertext)
  } catch {
    try {
      ;(await decryptObject(next, ref, ciphertext)).fill(0)
      return ciphertext
    } catch {
      return null
    }
  }
  try {
    return await encryptObject(next, ref, plaintext)
  } finally {
    plaintext.fill(0)
  }
}

type ReencryptPlan = {
  objects: LocalObject[]
  conflicts: ConflictRecord[]
  quarantine: QuarantineRecord[]
  objectSnapshot: Map<string, string>
  conflictSnapshot: Map<string, string>
}

async function planReencrypt(
  objects: LocalObject[],
  conflicts: ConflictRecord[],
  previous: CryptoKey,
  next: CryptoKey,
  previousId: string,
): Promise<ReencryptPlan> {
  const plan: ReencryptPlan = {
    objects: [],
    conflicts: [],
    quarantine: [],
    objectSnapshot: new Map(objects.map((object) => [object.objectId, fingerprintOf(object)])),
    conflictSnapshot: new Map(
      conflicts.map((conflict) => [conflict.objectId, conflictFingerprintOf(conflict)]),
    ),
  }
  const now = new Date().toISOString()
  for (const object of objects) {
    // tombstone (удаление ещё не отправлено) шифротекста не содержит — остаётся как есть
    if (object.deleted === 1 || object.ciphertext === null) continue
    const ciphertext = await reencrypt(
      previous,
      next,
      { objectId: object.objectId, kind: object.kind },
      object.ciphertext,
    )
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
    // Версия, dirty и время правки — прежние: для сервера это тот же объект (в отличие от adopt)
    plan.objects.push({ ...object, ciphertext })
  }
  for (const conflict of conflicts) {
    const { ciphertext: serverCipher, deleted } = conflict.server
    if (deleted || serverCipher === null) continue
    // Не расшифровалась серверная ветка — она и так показывается как «не удалось расшифровать»
    const ciphertext = await reencrypt(
      previous,
      next,
      { objectId: conflict.objectId, kind: conflict.kind },
      serverCipher,
    )
    if (ciphertext !== null && ciphertext !== serverCipher) {
      plan.conflicts.push({ ...conflict, server: { ...conflict.server, ciphertext } })
    }
  }
  return plan
}

/**
 * «Тот же аккаунт, новый ключ» (ротация MK, ADR-0012): хранилище переходит на новый MK аккаунта, оставаясь
 * привязанным к нему. В отличие от adoptMasterKey версии объектов, dirty-флаги и курсор синхронизации
 * сохраняются — неотправленные правки уйдут на сервер уже новой эпохой. Всё считается заранее
 * (перешифровка каждого живого объекта и серверных веток конфликтов со свежими DEK, карантин
 * нерасшифровываемого, новый ключ устройства и конверт), затем ОДНА транзакция; черновик ротации в ней же
 * удаляется. MK в памяти меняется только после tx.done.
 */
export function rekeyMasterKey(
  next: Uint8Array,
  keyEpoch: number,
  options: RekeyOptions = {},
): Promise<RekeyResult> {
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
        if (!record || (record.mkId && record.mkId !== previousId)) throw new VaultChangedError()
        const [objects, conflicts] = await Promise.all([
          db.getAll('objects'),
          db.getAll('conflicts'),
        ])
        const plan = await planReencrypt(objects, conflicts, previousKey, nextKey, previousId)
        const { deviceKey, envelope } = await sealForDevice(next)
        const account = options.account === undefined ? record.account : options.account
        const { pendingRotation: _done, ...rest } = record
        const updated: VaultRecord = {
          ...rest,
          deviceEnvelope: envelope,
          mkId: nextId,
          account: account ? { ...account, keyEpoch } : null,
          ...(options.kdfPin ? { kdfPin: options.kdfPin } : {}),
        }

        const tx = db.transaction(['objects', 'conflicts', 'meta', 'quarantine'], 'readwrite')
        let changed = false
        try {
          const objectStore = tx.objectStore('objects')
          const conflictStore = tx.objectStore('conflicts')
          const meta = tx.objectStore('meta')
          const [currentObjects, currentConflicts, currentRecord] = await Promise.all([
            objectStore.getAll(),
            conflictStore.getAll(),
            meta.get('vault') as Promise<VaultRecord | undefined>,
          ])
          changed =
            currentObjects.length !== plan.objectSnapshot.size ||
            currentObjects.some(
              (object) => plan.objectSnapshot.get(object.objectId) !== fingerprintOf(object),
            ) ||
            currentConflicts.length !== plan.conflictSnapshot.size ||
            currentConflicts.some(
              (conflict) =>
                plan.conflictSnapshot.get(conflict.objectId) !== conflictFingerprintOf(conflict),
            ) ||
            currentRecord?.deviceEnvelope !== record.deviceEnvelope
          if (changed) throw new VaultChangedError()
          const requests: Promise<unknown>[] = []
          const track = (request: Promise<unknown>) => {
            request.catch(() => undefined)
            requests.push(request)
          }
          const quarantine = tx.objectStore('quarantine')
          for (const item of plan.quarantine) {
            track(objectStore.delete(item.objectId))
            track(quarantine.put(item))
          }
          for (const object of plan.objects) track(objectStore.put(object))
          for (const conflict of plan.conflicts) track(conflictStore.put(conflict))
          track(meta.put(deviceKey, 'deviceKey'))
          track(meta.put(updated, 'vault'))
          // meta.sync (курсор) не трогаем: pull продолжится с того же места
          await Promise.all(requests)
        } catch (error) {
          try {
            tx.abort()
          } catch {
            // транзакция уже завершилась
          }
          await tx.done.catch(() => undefined)
          if (changed && attempt < REKEY_ATTEMPTS) continue
          throw error
        }
        await tx.done
        await setMasterKey(next)
        return {
          record: updated,
          rekeyed: plan.objects.length,
          quarantined: plan.quarantine.length,
        }
      }
    } finally {
      previous.fill(0)
    }
  })
}

/**
 * Сохранить черновик ротации: новый MK — под ключом устройства (тем же, что и основной MK). Хранилище
 * должно быть под MK этой вкладки; если за время обёртки ключ устройства сменился — VaultChangedError.
 */
export async function savePendingRotation(
  masterKey: Uint8Array,
  draft: { targetEpoch: number; startedAt: string },
): Promise<VaultRecord> {
  const { record, deviceKey } = await readVaultMeta()
  if (!record || !deviceKey) throw new VaultChangedError()
  if (record.mkId && record.mkId !== masterKeyFingerprint()) throw new VaultChangedError()
  const envelope = serializeEnvelope(
    await wrapMasterKey(masterKey, deviceKey, {
      type: 'device',
      kdf: { id: 'none' },
      salt: new Uint8Array(0),
    }),
  )
  const tx = (await database()).transaction('meta', 'readwrite')
  const current = (await tx.store.get('vault')) as VaultRecord | undefined
  if (!current || current.deviceEnvelope !== record.deviceEnvelope) {
    tx.abort()
    await tx.done.catch(() => undefined)
    throw new VaultChangedError()
  }
  const next: VaultRecord = {
    ...current,
    pendingRotation: { ...draft, deviceEnvelope: envelope },
  }
  await tx.store.put(next, 'vault')
  await tx.done
  return next
}

/** Черновик ротации с развёрнутым новым MK (вызывающий обнуляет masterKey). null — черновика нет */
export async function loadPendingRotation(): Promise<{
  targetEpoch: number
  startedAt: string
  masterKey: Uint8Array
} | null> {
  const { record, deviceKey } = await readVaultMeta()
  const pending = record?.pendingRotation
  if (!pending || !deviceKey) return null
  const masterKey = await unwrapMasterKey(parseEnvelope(pending.deviceEnvelope), deviceKey)
  return { targetEpoch: pending.targetEpoch, startedAt: pending.startedAt, masterKey }
}

/** Удалить черновик ротации (отменена, не началась или завершена) */
export function clearPendingRotation(): Promise<VaultRecord> {
  return updateVaultRecord((current) => {
    if (!current.pendingRotation) return current
    const { pendingRotation: _removed, ...rest } = current
    return rest
  })
}

/** Стирает хранилище этого устройства (серверные данные не трогает) */
export async function destroyVault(): Promise<void> {
  clearMasterKey()
  await destroyDatabase()
}
