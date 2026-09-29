import {
  decryptObject,
  encryptObject,
  generateMasterKey,
  importAeadKey,
} from '@impact-log/core/crypto'
import {
  type KeyRotation,
  MAX_ROTATION_STAGE_OBJECTS,
  type ObjectKind,
  PULL_LIMIT_MAX,
  rotationIncompleteSchema,
} from '@impact-log/shared'
import { computed, readonly, ref, shallowRef } from 'vue'
import {
  createRecoveryMaterial,
  decryptDeviceLabel,
  encryptDeviceLabel,
  errorKey,
  isSignedOutError,
  KeyMismatchError,
  pickEnvelope,
  type RecoveryMaterial,
  rewrapPasswordEnvelope,
  unlockWithPassword,
} from '@/account'
import { accountApi, devicesApi, keyRotationApi } from '@/api/account'
import { ApiError } from '@/api/http'
import {
  listConflicts,
  listObjects,
  loadPendingRotation,
  masterCryptoKey,
  masterKeyFingerprint,
  masterKeyId,
  readSyncState,
} from '@/vault'
import type { StageReporter } from './useAccount'
import { useSession } from './useSession'
import { useSync } from './useSync'
import { useVault } from './useVault'

/*
 * Ротация Master Key на устройстве-инициаторе (ADR-0012). Новый MK создаётся здесь, все живые объекты
 * перешифровываются им (свежие DEK) и складываются в черновик на сервере, commit атомарно подменяет данные,
 * конверты и Recovery Key. Пароль не меняется: password-конверт нового MK — тем же KEK.
 *
 * Черновик ротации на устройстве (vault.pendingRotation: новый MK под ключом устройства) пишется ДО start
 * и живёт до commit или отмены — перезагрузка посреди процесса не теряет новый ключ, продолжить можно без
 * пароля. Синглтон модуля: состояние общее для настроек и баннера.
 */

export type RotationPhase =
  | 'idle'
  /** Пароль → KDF → новый MK, конверты, Recovery Key */
  | 'preparing'
  /** Новый Recovery Key показан, ждём подтверждения «сохранил» */
  | 'kit'
  /** Черновик на устройстве + rotation/start */
  | 'starting'
  /** Синхронизация → перешифровка и черновик на сервере → commit → переход хранилища */
  | 'running'
  /** Сбой после start: можно повторить или отменить ротацию */
  | 'failed'
  | 'done'

export type RotationStep = 'sync' | 'encrypt' | 'commit' | 'finish'
export type RotationProgress = { step: RotationStep; done: number; total: number; attempt: number }

/**
 * aborted — отменили на этом устройстве; cancelled — ротации на сервере больше нет (отменили на другом
 * устройстве, сменили пароль, перевыпустили Recovery Key или восстановили доступ); otherAborted — отменили
 * отсюда ротацию, начатую на другом устройстве
 */
export type RotationNotice = 'aborted' | 'cancelled' | 'otherAborted'

/** Повторов commit после ROTATION_INCOMPLETE (объекты меняют на других устройствах) */
const COMMIT_ATTEMPTS = 5
/** Граница тела stage (сервер режет на 8 МиБ, как push) */
const STAGE_MAX_BYTES = 4 * 1024 * 1024
/** Запас на JSON одного объекта черновика (objectId, version, экранирование) */
const STAGE_ITEM_OVERHEAD = 120
const RATE_LIMIT_RETRIES = 3
const RATE_LIMIT_WAIT_MS = 10_000
/** Одна ротация на браузер: вторая вкладка не запустит параллельную перешифровку */
const ROTATION_LOCK = 'impact-log:key-rotation'

type Source = { objectId: string; kind: ObjectKind; version: number; ciphertext: string }

type Prepared = {
  masterKey: Uint8Array
  authKey: string
  passwordEnvelope: string
  recovery: RecoveryMaterial
  targetEpoch: number
}

const vault = useVault()
const session = useSession()
const sync = useSync()

const phase = ref<RotationPhase>('idle')
const progress = shallowRef<RotationProgress | null>(null)
const error = ref<string | null>(null)
const notice = ref<RotationNotice | null>(null)
/** Ротация на сервере (GET /api/keys) и эпоха ключа аккаунта; null — ещё не спрашивали */
const serverRotation = shallowRef<KeyRotation | null>(null)
const serverEpoch = ref<number | null>(null)
const inspected = ref(false)
/** Новый Recovery Key для показа (только до start) */
const kit = shallowRef<RecoveryMaterial | null>(null)
let prepared: Prepared | null = null
/** Названия устройств, расшифрованные прежним MK: после commit перешифровываются новым */
let labels: Array<{ deviceId: string; label: string }> | null = null
let inspecting: Promise<void> | null = null

const thisDevice = () => vault.account.value?.deviceId ?? null
const accountId = () => {
  const id = vault.account.value?.accountId
  if (!id) throw new ApiError(409, 'ACCOUNT_MISMATCH')
  return id
}

/* ---------------------------------------------------------------- закрытие вкладки */

function onBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault()
  // Chrome < 119 показывает предупреждение только при непустом returnValue
  event.returnValue = ''
}

function guardUnload(on: boolean) {
  if (typeof window === 'undefined') return
  if (on) window.addEventListener('beforeunload', onBeforeUnload)
  else window.removeEventListener('beforeunload', onBeforeUnload)
}

/** Web Lock на время перешифровки; null — ротация уже идёт в другой вкладке */
async function withRotationLock<T>(task: () => Promise<T>): Promise<T | null> {
  const locks = typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : null
  if (!locks) return task()
  return locks.request(ROTATION_LOCK, { ifAvailable: true }, (lock) =>
    lock ? task() : null,
  ) as Promise<T | null>
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function isApiCode(cause: unknown, code: string): cause is ApiError {
  return cause instanceof ApiError && cause.code === code
}

/* ---------------------------------------------------------------- источники перешифровки */

/**
 * Что перешифровывать: живые на сервере объекты с их серверной версией. Источник — локальное хранилище
 * (после синхронизации оно совпадает с сервером): серверная ветка конфликта, если он есть, иначе локальный
 * объект. Неотправленная локальная правка перешифровывается как есть — она всё равно уйдёт следующим push'ем.
 * Серверного содержимого нет на устройстве (локальное удаление ещё не отправлено, объекта нет вовсе) —
 * забираем его копию с сервера.
 */
async function collectSources(only?: ReadonlySet<string>): Promise<Source[]> {
  const [objects, conflicts] = await Promise.all([listObjects(), listConflicts()])
  const conflictById = new Map(conflicts.map((conflict) => [conflict.objectId, conflict]))
  const sources: Source[] = []
  const unknown = new Set<string>()
  const seen = new Set<string>()
  for (const object of objects) {
    const id = object.objectId
    seen.add(id)
    if (only && !only.has(id)) continue
    const conflict = conflictById.get(id)
    if (conflict) {
      if (!conflict.server.deleted && conflict.server.ciphertext !== null) {
        sources.push({
          objectId: id,
          kind: conflict.kind,
          version: conflict.server.version,
          ciphertext: conflict.server.ciphertext,
        })
      }
      continue
    }
    // Сервер о нём ещё не знает — перешифрует переход хранилища, уйдёт новым ключом
    if (object.version === 0) continue
    if (object.deleted === 1 || object.ciphertext === null) {
      unknown.add(id)
      continue
    }
    sources.push({
      objectId: id,
      kind: object.kind,
      version: object.version,
      ciphertext: object.ciphertext,
    })
  }
  for (const conflict of conflicts) {
    if (seen.has(conflict.objectId) || (only && !only.has(conflict.objectId))) continue
    seen.add(conflict.objectId)
    if (conflict.server.deleted || conflict.server.ciphertext === null) continue
    sources.push({
      objectId: conflict.objectId,
      kind: conflict.kind,
      version: conflict.server.version,
      ciphertext: conflict.server.ciphertext,
    })
  }
  if (only) for (const id of only) if (!seen.has(id)) unknown.add(id)
  if (unknown.size > 0) sources.push(...(await fetchServerCopies(unknown)))
  return sources
}

/** Серверные копии объектов, которых нет на устройстве: полный проход pull без применения к хранилищу */
async function fetchServerCopies(ids: ReadonlySet<string>): Promise<Source[]> {
  const found = new Map<string, { seq: number; source: Source | null }>()
  let cursor = 0
  for (;;) {
    const page = await sync.peek(cursor, PULL_LIMIT_MAX)
    for (const change of page.changes) {
      if (!ids.has(change.objectId)) continue
      const known = found.get(change.objectId)
      if (known && known.seq > change.seq) continue
      found.set(change.objectId, {
        seq: change.seq,
        source:
          change.deleted || change.ciphertext === null
            ? null
            : {
                objectId: change.objectId,
                kind: change.kind,
                version: change.version,
                ciphertext: change.ciphertext,
              },
      })
    }
    if (!page.hasMore || page.changes.length === 0 || page.cursor <= cursor) break
    cursor = page.cursor
  }
  return [...found.values()].flatMap((entry) => (entry.source ? [entry.source] : []))
}

/** Прежним MK расшифровать → новым зашифровать со свежим DEK. Уже под новым — как есть; null — не открылся */
async function reencrypt(previous: CryptoKey, next: CryptoKey, source: Source) {
  const ref = { objectId: source.objectId, kind: source.kind }
  let plaintext: Uint8Array
  try {
    plaintext = await decryptObject(previous, ref, source.ciphertext)
  } catch {
    try {
      ;(await decryptObject(next, ref, source.ciphertext)).fill(0)
      return source.ciphertext
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

class UndecryptableError extends Error {
  constructor(readonly count: number) {
    super('ROTATION_UNDECRYPTABLE')
    this.name = 'UndecryptableError'
  }
}

async function stageBatch(
  objects: Array<{ objectId: string; version: number; ciphertext: string }>,
) {
  for (let retry = 0; ; retry++) {
    try {
      return await keyRotationApi.stage(objects, accountId())
    } catch (cause) {
      if (!isApiCode(cause, 'RATE_LIMITED') || retry >= RATE_LIMIT_RETRIES) throw cause
      await sleep(RATE_LIMIT_WAIT_MS * (retry + 1))
    }
  }
}

/** Перешифровать и положить в черновик пачками (≤200 объектов, ≤4 МиБ), с прогрессом */
async function stageAll(sources: readonly Source[], masterKey: Uint8Array, attempt: number) {
  const previous = masterCryptoKey()
  const next = await importAeadKey(masterKey)
  let done = 0
  let undecryptable = 0
  progress.value = { step: 'encrypt', done, total: sources.length, attempt }
  let batch: Array<{ objectId: string; version: number; ciphertext: string }> = []
  let bytes = 0
  const flush = async () => {
    if (batch.length === 0) return
    await stageBatch(batch)
    done += batch.length
    progress.value = { step: 'encrypt', done, total: sources.length, attempt }
    batch = []
    bytes = 0
  }
  for (const source of sources) {
    const ciphertext = await reencrypt(previous, next, source)
    if (ciphertext === null) {
      undecryptable++
      done++
      continue
    }
    const size = ciphertext.length + STAGE_ITEM_OVERHEAD
    if (
      batch.length >= MAX_ROTATION_STAGE_OBJECTS ||
      (batch.length > 0 && bytes + size > STAGE_MAX_BYTES)
    ) {
      await flush()
    }
    batch.push({ objectId: source.objectId, version: source.version, ciphertext })
    bytes += size
  }
  await flush()
  // Серверный объект, который не открывается ключом аккаунта, перешифровать нельзя — commit не пройдёт
  if (undecryptable > 0) throw new UndecryptableError(undecryptable)
}

/* ---------------------------------------------------------------- названия устройств */

/** Названия устройств под прежним MK (лучшее усилие: без них ротация не ломается) */
async function readLabels() {
  try {
    const { devices } = await devicesApi.list()
    const result: Array<{ deviceId: string; label: string }> = []
    for (const device of devices) {
      const label = await decryptDeviceLabel(device.deviceId, device.encryptedLabel)
      if (label) result.push({ deviceId: device.deviceId, label })
    }
    labels = result
  } catch (cause) {
    console.warn('[rotation] cannot read device labels', cause)
  }
}

/** После перехода на новый MK: названия — новым ключом (ошибки не критичны) */
async function relabel() {
  const list = labels
  labels = null
  if (!list) return
  for (const { deviceId, label } of list) {
    try {
      await devicesApi.rename(deviceId, await encryptDeviceLabel(deviceId, label))
    } catch (cause) {
      console.warn('[rotation] cannot re-encrypt device label', cause)
    }
  }
}

/* ---------------------------------------------------------------- этапы */

/**
 * commit уже прошёл (ответ потерялся, вкладку перезагрузили)? Серверные объекты новой эпохи должны
 * открываться новым MK из черновика. Проверяем по первым объектам после курсора этого устройства
 * (commit выдал всем живым объектам новые seq); объектов нет — проверять нечего.
 */
async function committedWith(masterKey: Uint8Array, epoch: number): Promise<boolean> {
  const { cursor } = await readSyncState()
  const page = await sync.peek(cursor, 100)
  const sample = page.changes.find(
    (change) => change.keyEpoch === epoch && !change.deleted && change.ciphertext !== null,
  )
  if (!sample?.ciphertext) return true
  try {
    const key = await importAeadKey(masterKey)
    ;(
      await decryptObject(key, { objectId: sample.objectId, kind: sample.kind }, sample.ciphertext)
    ).fill(0)
    return true
  } catch {
    return false
  }
}

/** Хранилище переходит на новый MK (черновик удаляется в той же транзакции), синхронизация продолжается */
async function finish(masterKey: Uint8Array, keyEpoch: number) {
  progress.value = { step: 'finish', done: 0, total: 0, attempt: 0 }
  if (!labels) await readLabels()
  await vault.rekeyMasterKey(masterKey, keyEpoch)
  await relabel()
  serverRotation.value = null
  serverEpoch.value = keyEpoch
  phase.value = 'done'
  progress.value = null
  void sync.start().catch(() => undefined)
}

/** Ротации на сервере больше нет: черновик не нужен, работаем прежним ключом */
async function dropDraft(reason: RotationNotice) {
  await vault.clearPendingRotation().catch((cause) => {
    console.warn('[rotation] cannot clear draft', cause)
  })
  serverRotation.value = null
  labels = null
  progress.value = null
  phase.value = 'idle'
  notice.value = reason
  void sync.start().catch(() => undefined)
}

async function commitWithRetries(masterKey: Uint8Array) {
  for (let attempt = 1; ; attempt++) {
    progress.value = { step: 'commit', done: 0, total: 0, attempt }
    try {
      const { keyEpoch } = await keyRotationApi.commit(accountId())
      return keyEpoch
    } catch (cause) {
      if (!isApiCode(cause, 'ROTATION_INCOMPLETE') || attempt >= COMMIT_ATTEMPTS) throw cause
      const details = rotationIncompleteSchema.safeParse(cause.details)
      const ids = new Set(details.success ? [...details.data.missing, ...details.data.stale] : [])
      // Объекты изменили или создали на других устройствах: забираем их и дошифровываем
      progress.value = { step: 'sync', done: 0, total: 0, attempt: attempt + 1 }
      await sync.runCycle()
      await stageAll(await collectSources(ids.size > 0 ? ids : undefined), masterKey, attempt + 1)
    }
  }
}

/**
 * Основная часть (и продолжение после перезагрузки): сверка с сервером → синхронизация (неотправленное
 * уходит, свежее приходит) и пауза во всех вкладках → перешифровка и черновик → commit → переход хранилища.
 */
async function run(masterKey: Uint8Array, targetEpoch: number) {
  const outcome = await withRotationLock(async () => {
    phase.value = 'running'
    error.value = null
    notice.value = null
    guardUnload(true)
    let committing = false
    try {
      progress.value = { step: 'sync', done: 0, total: 0, attempt: 1 }
      const keys = await accountApi.keys()
      serverEpoch.value = keys.keyEpoch
      serverRotation.value = keys.rotation
      if (!keys.rotation) {
        if (keys.keyEpoch >= targetEpoch && (await committedWith(masterKey, keys.keyEpoch))) {
          await finish(masterKey, keys.keyEpoch)
        } else {
          await dropDraft('cancelled')
        }
        return true
      }
      if (keys.rotation.deviceId !== thisDevice()) {
        await dropDraft('cancelled')
        return true
      }
      sync.pause()
      await sync.runCycle()
      await readLabels()
      await stageAll(await collectSources(), masterKey, 1)
      committing = true
      const keyEpoch = await commitWithRetries(masterKey)
      await finish(masterKey, keyEpoch)
    } catch (cause) {
      if (isApiCode(cause, 'NO_ROTATION') || isApiCode(cause, 'FORBIDDEN')) {
        // Ротацию отменили (другим устройством, сменой пароля, перевыпуском Recovery Key, восстановлением)
        await dropDraft('cancelled')
        return true
      }
      console.warn('[rotation] failed', cause)
      if (isSignedOutError(cause)) session.markExpired()
      error.value =
        cause instanceof UndecryptableError ? 'errors.ROTATION_UNDECRYPTABLE' : errorKey(cause)
      phase.value = 'failed'
      progress.value = null
      // Пока ротация не завершена, синхронизация идёт прежним ключом. Если оборвался сам commit, он мог
      // пройти — тогда прежним ключом нельзя; разберётся «Повторить»
      const unknownCommit = committing && cause instanceof ApiError && cause.status === 0
      if (!unknownCommit) void sync.start().catch(() => undefined)
    } finally {
      guardUnload(false)
    }
    return true
  })
  if (outcome === null) {
    error.value = 'errors.ROTATION_OTHER_TAB'
    phase.value = 'failed'
  }
}

/* ---------------------------------------------------------------- публичные действия */

/**
 * Шаг 1: текущий пароль → KDF (воркер) → текущий password-конверт открывается KEK'ом, его MK сверяется с MK
 * хранилища (отпечаток) → новый MK, его password-конверт тем же KEK (та же соль и KDF) и новый Recovery Key.
 * На сервер ничего не уходит — сначала пользователь сохраняет новый Recovery Key.
 */
async function prepare(password: string, onStage: StageReporter = () => {}) {
  if (phase.value !== 'idle' && phase.value !== 'done') return
  phase.value = 'preparing'
  error.value = null
  notice.value = null
  const masterKey = generateMasterKey()
  let current: Uint8Array | null = null
  try {
    onStage('server')
    const keys = await accountApi.keys()
    serverEpoch.value = keys.keyEpoch
    serverRotation.value = keys.rotation
    if (keys.rotation) throw new ApiError(409, 'ROTATION_IN_PROGRESS')
    onStage('kdf')
    const rewrapped = await rewrapPasswordEnvelope(
      pickEnvelope(keys.envelopes, 'password'),
      password,
      masterKey,
    )
    current = rewrapped.currentMasterKey
    onStage('verify')
    if ((await masterKeyId(current)) !== masterKeyFingerprint()) {
      throw new KeyMismatchError()
    }
    const recovery = await createRecoveryMaterial(masterKey)
    prepared = {
      masterKey,
      authKey: rewrapped.authKey,
      passwordEnvelope: rewrapped.passwordEnvelope,
      recovery,
      targetEpoch: keys.keyEpoch + 1,
    }
    kit.value = recovery
    phase.value = 'kit'
  } catch (cause) {
    masterKey.fill(0)
    phase.value = 'idle'
    if (isSignedOutError(cause)) session.markExpired()
    throw cause
  } finally {
    current?.fill(0)
  }
}

/** Отказались на экране нового Recovery Key — на сервере ничего не менялось */
function discardPrepared() {
  prepared?.masterKey.fill(0)
  prepared = null
  kit.value = null
  if (phase.value === 'kit' || phase.value === 'preparing') phase.value = 'idle'
}

/**
 * Шаг 2 (Recovery Key сохранён): черновик на устройстве → rotation/start → перешифровка. Черновик пишется до
 * start: оборвётся связь после start — новый ключ не потеряется. Сервер отказал (ротация не началась) —
 * черновик удаляется; сетевая ошибка — остаётся (что на сервере, покажет inspect).
 */
async function confirmKit() {
  const current = prepared
  if (!current || phase.value !== 'kit') return
  phase.value = 'starting'
  error.value = null
  try {
    await vault.savePendingRotation(current.masterKey, {
      targetEpoch: current.targetEpoch,
      startedAt: new Date().toISOString(),
    })
    let rotation: KeyRotation
    try {
      rotation = await keyRotationApi.start({
        currentAuthKey: current.authKey,
        passwordEnvelope: current.passwordEnvelope,
        recoveryEnvelope: current.recovery.recoveryEnvelope,
        recoveryAuthKey: current.recovery.recoveryAuthKey,
      })
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.status === 0)) await vault.clearPendingRotation()
      throw cause
    }
    serverRotation.value = rotation
    prepared = null
    kit.value = null
    await run(current.masterKey, rotation.targetEpoch)
    current.masterKey.fill(0)
  } catch (cause) {
    if (isSignedOutError(cause)) session.markExpired()
    error.value = errorKey(cause, 'reauth')
    if (vault.pendingRotation.value) {
      // Связь оборвалась на start: началась ли ротация, выяснит «Повторить» (новый ключ — в черновике)
      discardPrepared()
      phase.value = 'failed'
    } else if (
      isApiCode(cause, 'ROTATION_IN_PROGRESS') ||
      isApiCode(cause, 'INVALID_CREDENTIALS')
    ) {
      discardPrepared()
      phase.value = 'idle'
      void inspect(true)
    } else {
      // Сервер не ответил по делу (лимит, сбой) — можно повторить с тем же комплектом: пароль уже проверен
      phase.value = 'kit'
    }
  }
}

/** Продолжить после перезагрузки или сбоя: новый MK — из черновика на устройстве, пароль не нужен */
async function resume() {
  if (phase.value === 'running' || phase.value === 'starting') return
  error.value = null
  const draft = await loadPendingRotation().catch((cause) => {
    console.warn('[rotation] cannot open draft', cause)
    return null
  })
  if (!draft) {
    await dropDraft('cancelled')
    return
  }
  try {
    await run(draft.masterKey, draft.targetEpoch)
  } finally {
    draft.masterKey.fill(0)
  }
}

/** Отменить свою ротацию: черновик на сервере и на устройстве удаляется, всё остаётся под прежним ключом */
async function abort() {
  if (phase.value === 'running' || phase.value === 'starting') return
  error.value = null
  try {
    await keyRotationApi.abort()
  } catch (cause) {
    if (isSignedOutError(cause)) session.markExpired()
    error.value = errorKey(cause)
    return
  }
  await dropDraft('aborted')
}

/** Отменить ротацию, начатую на другом устройстве (оно потеряно или ротация брошена): нужен пароль */
async function abortOther(password: string, onStage: StageReporter = () => {}) {
  onStage('server')
  const { envelopes } = await accountApi.keys().catch((cause) => {
    if (isSignedOutError(cause)) session.markExpired()
    throw cause
  })
  onStage('kdf')
  const { authKey, masterKey } = await unlockWithPassword(
    pickEnvelope(envelopes, 'password'),
    password,
  )
  masterKey.fill(0)
  onStage('server')
  await keyRotationApi.abort(authKey).catch((cause) => {
    if (isSignedOutError(cause)) session.markExpired()
    throw cause
  })
  serverRotation.value = null
  notice.value = 'otherAborted'
}

/**
 * Сверка с сервером (старт приложения, вход, открытие настроек): идёт ли ротация и чья. Черновик этого
 * устройства без ротации на сервере — commit прошёл (завершаем переход без пароля) или ротацию отменили
 * (удаляем черновик и сообщаем). Синхронизацию при черновике bootstrap не запускает — её запускает эта сверка.
 */
function inspect(force = false): Promise<void> {
  if (inspecting) return inspecting
  inspecting = (async () => {
    if (!vault.account.value) return
    if (phase.value === 'running' || phase.value === 'starting' || phase.value === 'preparing')
      return
    const draft = vault.pendingRotation.value
    const idle = () => sync.status.value === 'off' || sync.status.value === 'paused'
    // Страница только открылась: сессию ещё проверяет bootstrapAccount — дожидаемся того же запроса
    if (session.state.value === 'unknown') await session.refresh()
    if (session.state.value !== 'active') {
      // Сессия не проверена (нет сети): синхронизация сама попробует позже; объект новой эпохи её остановит
      if (draft && session.state.value === 'unknown' && idle())
        void sync.start().catch(() => undefined)
      return
    }
    if (inspected.value && !force && !draft) return
    try {
      const keys = await accountApi.keys()
      inspected.value = true
      serverEpoch.value = keys.keyEpoch
      serverRotation.value = keys.rotation
      if (!draft) return
      if (keys.rotation?.deviceId === thisDevice()) {
        // Ротация ждёт продолжения; пока — синхронизация прежним ключом
        if (idle()) void sync.start().catch(() => undefined)
        return
      }
      if (!keys.rotation && keys.keyEpoch >= draft.targetEpoch) {
        // commit, похоже, прошёл, а переход хранилища — нет: доделываем без пароля
        await resume()
        return
      }
      await dropDraft('cancelled')
    } catch (cause) {
      if (isSignedOutError(cause)) session.markExpired()
      // Сервер недоступен: синхронизация сама разберётся (объект новой эпохи её остановит)
      else if (draft && idle()) void sync.start().catch(() => undefined)
    }
  })().finally(() => {
    inspecting = null
  })
  return inspecting
}

function dismiss() {
  notice.value = null
  error.value = null
  if (phase.value === 'done') phase.value = 'idle'
}

/**
 * Пересверить ротацию с сервером: после входа, смены пароля, перевыпуска Recovery Key (они отменяют
 * ротацию). onlyDraft — только если на устройстве есть черновик (старт приложения)
 */
export function refreshKeyRotation(options: { onlyDraft?: boolean } = {}): Promise<void> {
  if (options.onlyDraft && !vault.pendingRotation.value) return Promise.resolve()
  return inspect(true)
}

export function useKeyRotation() {
  const draft = vault.pendingRotation
  const busy = computed(
    () => phase.value === 'preparing' || phase.value === 'starting' || phase.value === 'running',
  )
  /** Черновик этого устройства, ротация на сервере ждёт продолжения (не идёт прямо сейчас) */
  const unfinished = computed(() => {
    if (!draft.value || busy.value || phase.value === 'kit') return null
    const confirmed = serverRotation.value?.deviceId === thisDevice()
    if (!confirmed && phase.value !== 'failed') return null
    return { startedAt: serverRotation.value?.startedAt ?? draft.value.startedAt }
  })
  /** Доля выполненного, %: синхронизация 5, перешифровка 5–85, commit 90, переход хранилища 97 */
  const percent = computed(() => {
    const current = progress.value
    if (phase.value === 'starting' || !current) return 2
    if (current.step === 'sync') return 5
    if (current.step === 'encrypt')
      return 5 + Math.round((80 * current.done) / Math.max(1, current.total))
    return current.step === 'commit' ? 90 : 97
  })
  /** Ротацию начало другое устройство */
  const otherDevice = computed(() => {
    const rotation = serverRotation.value
    return rotation && rotation.deviceId !== thisDevice() ? rotation : null
  })
  return {
    phase: readonly(phase),
    progress: readonly(progress),
    error: readonly(error),
    notice: readonly(notice),
    kit: readonly(kit),
    busy,
    percent,
    unfinished,
    otherDevice,
    serverEpoch: readonly(serverEpoch),
    prepare,
    discardPrepared,
    confirmKit,
    resume,
    abort,
    abortOther,
    inspect,
    dismiss,
  }
}
