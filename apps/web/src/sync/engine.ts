import { type Impact, newId } from '@impact-log/core'
import {
  MAX_OBJECT_CIPHERTEXT,
  type PushChange,
  type PushResult,
  type ServerObject,
} from '@impact-log/shared'
import { copyImpact, diffImpacts, type SyncCodec, sameImpact } from './content'
import {
  type ConflictRecord,
  httpStatus,
  type LocalObject,
  type SyncStore,
  type SyncTransport,
  type Updater,
} from './types'

/*
 * Движок синхронизации (ADR-0007): чистый алгоритм без Vue/IndexedDB/fetch.
 *
 * Цикл: pull (до hasMore=false, курсор сохраняется после каждой страницы) → push (dirty-объекты пачками)
 * → повторный pull, если были конфликты. Одновременно идёт один цикл; вызовы sync() во время цикла
 * схлопываются в один следующий.
 *
 * Ничего не теряем: при расхождении веток локальная остаётся в objects, серверная — в conflicts,
 * пользователь выбирает сам (resolve). Одинаковое содержимое (без учёта updatedAt) — не конфликт.
 */
export const PUSH_MAX_CHANGES = 100
export const PUSH_MAX_BYTES = 4 * 1024 * 1024
export const PULL_LIMIT = 500
/** Запас на JSON-обёртку одного изменения (objectId, kind, baseVersion, экранирование) */
const CHANGE_OVERHEAD = 200
const MIN_PUSH_BYTES = 64 * 1024

export type EngineOptions = {
  pullLimit?: number
  pushMaxChanges?: number
  pushMaxBytes?: number
  now?: () => Date
  log?: (message: string, details?: unknown) => void
}

export type CycleReport = {
  /** Серверных изменений получено / применено к локальному хранилищу */
  pulled: number
  applied: number
  accepted: number
  /** Новых конфликтов (ветки разошлись) */
  conflicts: number
  /** Конфликтов, снятых автоматически (одинаковое содержимое) */
  merged: number
  quotaRejected: number
  invalid: number
  /** Локальное хранилище изменилось — экранам нужно перечитать записи */
  localChanged: boolean
}

export type SyncIssueCode = 'INVALID' | 'TOO_LARGE'

export type ResolveChoice = 'local' | 'server' | 'both'

export type ConflictSide = {
  deleted: boolean
  /** null — удалено или не расшифровалось */
  impact: Impact | null
  undecryptable: boolean
  version: number
}

export type ConflictView = {
  objectId: string
  detectedAt: string
  local: ConflictSide & { updatedAt: string | null }
  server: ConflictSide
  /** Поля с разным содержимым (если обе ветки расшифрованы) */
  diff: string[]
  /** «Оставить обе» возможно, только если обе ветки — живые записи */
  canKeepBoth: boolean
}

export class SyncAbortedError extends Error {
  constructor() {
    super('SYNC_ABORTED')
    this.name = 'SyncAbortedError'
  }
}

export class ConflictResolutionError extends Error {
  constructor(code: 'NO_CONFLICT' | 'KEEP_BOTH_UNAVAILABLE' | 'UNDECRYPTABLE' | 'CHANGED') {
    super(code)
    this.name = 'ConflictResolutionError'
  }
}

/** Результат сравнения веток, посчитанный до транзакции (расшифровка асинхронна) */
type Verdict = { localCiphertext: string | null; localDeleted: 0 | 1 | null; same: boolean }

type Outcome = { applied: number; conflicts: number; merged: number; freed: number }

const isDeletedRemote = (server: ServerObject) => server.deleted || server.ciphertext === null

function emptyReport(): CycleReport {
  return {
    pulled: 0,
    applied: 0,
    accepted: 0,
    conflicts: 0,
    merged: 0,
    quotaRejected: 0,
    invalid: 0,
    localChanged: false,
  }
}

/** Порядок отправки: удаления (освобождают квоту в том же push) → правки → создания */
function pushRank(object: LocalObject): number {
  if (object.deleted === 1) return 0
  return object.version > 0 ? 1 : 2
}

function changeSize(object: LocalObject): number {
  return (object.ciphertext?.length ?? 0) + CHANGE_OVERHEAD
}

function unchangedSince(current: LocalObject, sent: LocalObject): boolean {
  return (
    current.ciphertext === sent.ciphertext &&
    current.deleted === sent.deleted &&
    current.updatedAt === sent.updatedAt
  )
}

export class SyncEngine {
  private running: Promise<CycleReport> | null = null
  private queued: Promise<CycleReport> | null = null
  /** Смена эпохи (reset) обрывает идущий цикл: он больше ничего не пишет */
  private epoch = 0
  /** Создания, отклонённые по квоте: не отправляем снова, пока квота не освободится или не сменится тариф */
  private readonly quotaBlocked = new Set<string>()
  private readonly issues = new Map<string, SyncIssueCode>()
  /**
   * Что этот движок сам успешно отправил: страховка от гонки «репозиторий прочитал старую версию,
   * а движок тем временем записал принятую» — это не конфликт, а наша же версия.
   */
  private readonly ownAccepted = new Map<string, { version: number; ciphertext: string | null }>()
  private pushMaxChanges: number
  private pushMaxBytes: number
  private readonly pullLimit: number
  private readonly now: () => Date
  private readonly log: (message: string, details?: unknown) => void

  constructor(
    private readonly store: SyncStore,
    private readonly transport: SyncTransport,
    private readonly codec: SyncCodec,
    private readonly options: EngineOptions = {},
  ) {
    this.pullLimit = options.pullLimit ?? PULL_LIMIT
    this.pushMaxChanges = options.pushMaxChanges ?? PUSH_MAX_CHANGES
    this.pushMaxBytes = options.pushMaxBytes ?? PUSH_MAX_BYTES
    this.now = options.now ?? (() => new Date())
    this.log =
      options.log ?? ((message, details) => console.warn(`[sync] ${message}`, details ?? ''))
  }

  /** Один цикл синхронизации; если цикл уже идёт — ровно один следующий после него */
  sync(): Promise<CycleReport> {
    if (!this.running) {
      const run = this.cycle().finally(() => {
        if (this.running === run) this.running = null
      })
      this.running = run
      return run
    }
    this.queued ??= this.running
      .catch(() => undefined)
      .then(() => {
        this.queued = null
        return this.sync()
      })
    return this.queued
  }

  get busy(): boolean {
    return this.running !== null
  }

  /** Новый аккаунт / MK / выход: забыть всё, что движок помнит в памяти, и оборвать идущий цикл */
  reset(): void {
    this.epoch++
    this.quotaBlocked.clear()
    this.issues.clear()
    this.ownAccepted.clear()
    this.pushMaxChanges = this.options.pushMaxChanges ?? PUSH_MAX_CHANGES
    this.pushMaxBytes = this.options.pushMaxBytes ?? PUSH_MAX_BYTES
  }

  /** Тариф сменился или место освободилось — снова пробуем отправить отклонённые по квоте записи */
  releaseQuota(): void {
    this.quotaBlocked.clear()
  }

  /** Объекты, которые сервер отклонил как некорректные / слишком большие (не отправляются повторно) */
  listIssues(): Array<{ objectId: string; code: SyncIssueCode }> {
    return [...this.issues].map(([objectId, code]) => ({ objectId, code }))
  }

  async counts(): Promise<{ pending: number; conflicts: number; quotaBlocked: number }> {
    const [dirty, conflicts] = await Promise.all([
      this.store.listDirty(),
      this.store.listConflicts(),
    ])
    const conflicted = new Set(conflicts.map((conflict) => conflict.objectId))
    const pending = dirty.filter((object) => !conflicted.has(object.objectId))
    return {
      pending: pending.length,
      conflicts: conflicts.length,
      quotaBlocked: pending.filter((object) => this.quotaBlocked.has(object.objectId)).length,
    }
  }

  readState() {
    return this.store.readState()
  }

  /* ---------------------------------------------------------------- цикл */

  private async cycle(): Promise<CycleReport> {
    const epoch = this.epoch
    const report = emptyReport()
    const pulled = await this.pullAll(report, epoch)
    // Другое устройство что-то удалило — место в квоте могло освободиться
    if (pulled.freed > 0) this.releaseQuota()
    const pushed = await this.pushAll(report, epoch)
    if (pushed.freed > 0 && this.quotaBlocked.size > 0) {
      this.releaseQuota()
      await this.pushAll(report, epoch)
    }
    // Ветки разошлись — пока шёл цикл, на сервере появились чужие изменения: забираем и их
    if (pushed.conflicts > 0) await this.pullAll(report, epoch)
    this.guard(epoch)
    const state = await this.store.readState()
    await this.store.writeState({ ...state, lastSyncAt: this.now().toISOString() })
    return report
  }

  private guard(epoch: number) {
    if (epoch !== this.epoch) throw new SyncAbortedError()
  }

  /** Решения устаревшей эпохи (reset во время await) не применяются — даже внутри транзакции */
  private applyGuarded(epoch: number, updates: Map<string, Updater>): Promise<void> {
    const guarded = new Map<string, Updater>()
    for (const [id, update] of updates) {
      guarded.set(id, (current, conflict) =>
        epoch === this.epoch ? update(current, conflict) : {},
      )
    }
    return this.store.apply(guarded)
  }

  /* ---------------------------------------------------------------- pull */

  private async pullAll(report: CycleReport, epoch: number): Promise<Outcome> {
    const total: Outcome = { applied: 0, conflicts: 0, merged: 0, freed: 0 }
    let state = await this.store.readState()
    for (;;) {
      const page = await this.transport.pull(state.cursor, this.pullLimit)
      this.guard(epoch)
      report.pulled += page.changes.length
      if (page.changes.length > 0) {
        const outcome = await this.applyRemote(page.changes, epoch)
        this.guard(epoch)
        total.applied += outcome.applied
        total.conflicts += outcome.conflicts
        total.merged += outcome.merged
        total.freed += outcome.freed
      }
      state = { ...(await this.store.readState()), cursor: Math.max(state.cursor, page.cursor) }
      await this.store.writeState(state)
      if (!page.hasMore || page.changes.length === 0) break
    }
    report.applied += total.applied
    report.conflicts += total.conflicts
    report.merged += total.merged
    if (total.applied + total.conflicts + total.merged > 0) report.localChanged = true
    return total
  }

  private async applyRemote(changes: readonly ServerObject[], epoch: number): Promise<Outcome> {
    // Внутри страницы объект встречается один раз, но на всякий случай берём последнее состояние
    const latest = new Map<string, ServerObject>()
    for (const change of changes) {
      const known = latest.get(change.objectId)
      if (!known || known.seq < change.seq) latest.set(change.objectId, change)
    }
    const snapshot = await this.store.read([...latest.keys()])
    const verdicts = new Map<string, Verdict>()
    for (const server of latest.values()) {
      const entry = snapshot.get(server.objectId)
      if (this.needsCompare(entry?.object, entry?.conflict, server)) {
        verdicts.set(server.objectId, await this.compare(entry?.object, server))
      }
    }
    const outcome: Outcome = { applied: 0, conflicts: 0, merged: 0, freed: 0 }
    const updates = new Map<string, Updater>()
    for (const server of latest.values()) {
      updates.set(server.objectId, (current, conflict) =>
        this.decideRemote(server, current, conflict, verdicts.get(server.objectId), outcome, false),
      )
    }
    await this.applyGuarded(epoch, updates)
    return outcome
  }

  private needsCompare(
    local: LocalObject | undefined,
    conflict: ConflictRecord | undefined,
    server: ServerObject,
  ): boolean {
    if (conflict) return server.version > conflict.server.version
    return local !== undefined && local.dirty === 1 && local.version < server.version
  }

  /** Совпадает ли содержимое локальной ветки с серверной (обе удалены — тоже совпадение) */
  private async compare(local: LocalObject | undefined, server: ServerObject): Promise<Verdict> {
    const localCipher = local && local.deleted === 0 ? local.ciphertext : null
    const serverCipher = server.deleted ? null : server.ciphertext
    const verdict: Verdict = {
      localCiphertext: local?.ciphertext ?? null,
      localDeleted: local ? local.deleted : null,
      same: false,
    }
    if (localCipher === null || serverCipher === null) {
      verdict.same = localCipher === null && serverCipher === null
      return verdict
    }
    const ref = { objectId: server.objectId, kind: server.kind }
    const [mine, theirs] = await Promise.all([
      this.codec.open(ref, localCipher),
      this.codec.open(ref, serverCipher),
    ])
    verdict.same = mine !== null && theirs !== null && sameImpact(mine, theirs)
    return verdict
  }

  private fromServer(server: ServerObject): LocalObject {
    return {
      objectId: server.objectId,
      kind: server.kind,
      ciphertext: server.ciphertext,
      version: server.version,
      dirty: 0,
      deleted: 0,
      updatedAt: this.now().toISOString(),
    }
  }

  /** Принять серверную ветку целиком */
  private adopt(server: ServerObject): LocalObject | null {
    return isDeletedRemote(server) ? null : this.fromServer(server)
  }

  private newConflict(server: ServerObject): ConflictRecord {
    return {
      objectId: server.objectId,
      kind: server.kind,
      server: {
        version: server.version,
        ciphertext: server.ciphertext,
        deleted: isDeletedRemote(server),
      },
      detectedAt: this.now().toISOString(),
    }
  }

  /**
   * Решение по серверному состоянию объекта (из pull или из ответа push «conflict»).
   * Синхронно, внутри транзакции: verdict действителен, только если локальная ветка не изменилась.
   */
  private decideRemote(
    server: ServerObject,
    current: LocalObject | undefined,
    conflict: ConflictRecord | undefined,
    verdict: Verdict | undefined,
    outcome: Outcome,
    fromPush: boolean,
  ) {
    const verdictHolds =
      verdict !== undefined &&
      (current?.ciphertext ?? null) === verdict.localCiphertext &&
      (current?.deleted ?? null) === verdict.localDeleted
    const remoteDeleted = isDeletedRemote(server)

    if (conflict) {
      if (server.version <= conflict.server.version) return {}
      if (verdictHolds && verdict?.same) {
        outcome.merged++
        return { object: current ? this.adopt(server) : undefined, conflict: null }
      }
      // Серверная ветка ушла дальше — храним самую свежую
      outcome.conflicts++
      return { conflict: { ...this.newConflict(server), detectedAt: conflict.detectedAt } }
    }

    if (!current) {
      if (remoteDeleted) return {}
      outcome.applied++
      return { object: this.fromServer(server) }
    }
    if (!fromPush && current.version >= server.version) return {} // своё же изменение или старое
    if (current.dirty === 0) {
      if (current.version >= server.version) return {}
      outcome.applied++
      if (remoteDeleted) outcome.freed++
      return { object: this.adopt(server) }
    }

    // Локальные изменения поверх устаревшей версии
    const own = this.ownAccepted.get(server.objectId)
    if (own && own.version === server.version && own.ciphertext === server.ciphertext) {
      return { object: { ...current, version: server.version } }
    }
    if (verdictHolds && verdict?.same) {
      outcome.merged++
      if (remoteDeleted) outcome.freed++
      return { object: this.adopt(server) }
    }
    outcome.conflicts++
    return { conflict: this.newConflict(server) }
  }

  /* ---------------------------------------------------------------- push */

  private async pushAll(report: CycleReport, epoch: number): Promise<Outcome> {
    const total: Outcome = { applied: 0, conflicts: 0, merged: 0, freed: 0 }
    const [dirty, conflicts] = await Promise.all([
      this.store.listDirty(),
      this.store.listConflicts(),
    ])
    const conflicted = new Set(conflicts.map((conflict) => conflict.objectId))
    const queue: LocalObject[] = []
    for (const object of dirty) {
      const id = object.objectId
      if (conflicted.has(id) || this.quotaBlocked.has(id) || this.issues.has(id)) continue
      if (object.ciphertext !== null && object.ciphertext.length > MAX_OBJECT_CIPHERTEXT) {
        this.issues.set(id, 'TOO_LARGE')
        report.invalid++
        this.log('object is too large to sync', id)
        continue
      }
      queue.push(object)
    }
    queue.sort((a, b) => pushRank(a) - pushRank(b) || (a.updatedAt < b.updatedAt ? -1 : 1))

    let index = 0
    while (index < queue.length) {
      const batch: LocalObject[] = []
      let bytes = 0
      while (index + batch.length < queue.length && batch.length < this.pushMaxChanges) {
        const next = queue[index + batch.length] as LocalObject
        if (batch.length > 0 && bytes + changeSize(next) > this.pushMaxBytes) break
        batch.push(next)
        bytes += changeSize(next)
      }
      let results: PushResult[]
      try {
        results = (await this.transport.push(batch.map(toChange))).results
      } catch (error) {
        if (httpStatus(error) !== 413) throw error
        // Тело слишком большое — уменьшаем пачку и повторяем
        if (batch.length === 1) {
          this.issues.set((batch[0] as LocalObject).objectId, 'TOO_LARGE')
          report.invalid++
          index += 1
          continue
        }
        this.pushMaxChanges = Math.max(1, Math.floor(batch.length / 2))
        this.pushMaxBytes = Math.max(MIN_PUSH_BYTES, Math.floor(bytes / 2))
        this.log('push payload too large, shrinking batch', this.pushMaxChanges)
        continue
      }
      this.guard(epoch)
      const outcome = await this.applyPushResults(batch, results, report, epoch)
      this.guard(epoch)
      total.applied += outcome.applied
      total.conflicts += outcome.conflicts
      total.merged += outcome.merged
      total.freed += outcome.freed
      index += batch.length
    }
    report.conflicts += total.conflicts
    report.merged += total.merged
    if (total.conflicts + total.merged + total.applied > 0) report.localChanged = true
    return total
  }

  private async applyPushResults(
    batch: readonly LocalObject[],
    results: readonly PushResult[],
    report: CycleReport,
    epoch: number,
  ): Promise<Outcome> {
    const sent = new Map(batch.map((object) => [object.objectId, object]))
    const verdicts = new Map<string, Verdict>()
    for (const result of results) {
      if (result.status !== 'conflict') continue
      verdicts.set(result.objectId, await this.compare(sent.get(result.objectId), result.server))
    }
    const outcome: Outcome = { applied: 0, conflicts: 0, merged: 0, freed: 0 }
    const updates = new Map<string, Updater>()
    const now = this.now().toISOString()

    for (const result of results) {
      const original = sent.get(result.objectId)
      if (!original) continue
      const id = result.objectId
      if (result.status === 'accepted') {
        report.accepted++
        this.ownAccepted.set(id, { version: result.version, ciphertext: original.ciphertext })
        if (original.deleted === 1) outcome.freed++
        updates.set(id, (current) => {
          if (!current) {
            if (original.deleted === 1) return {}
            // Запись удалили, пока шёл запрос (без tombstone — она была новой): удаляем и на сервере
            outcome.applied++
            return {
              object: {
                objectId: id,
                kind: original.kind,
                ciphertext: null,
                version: result.version,
                dirty: 1,
                deleted: 1,
                updatedAt: now,
              },
            }
          }
          if (unchangedSince(current, original)) {
            return original.deleted === 1
              ? { object: null }
              : { object: { ...current, version: result.version, dirty: 0 } }
          }
          // Изменили во время запроса — остаётся dirty, но уже поверх принятой версии
          return { object: { ...current, version: result.version } }
        })
      } else if (result.status === 'conflict') {
        const server = result.server
        updates.set(id, (current, conflict) =>
          this.decideRemote(server, current, conflict, verdicts.get(id), outcome, true),
        )
      } else if (result.code === 'QUOTA_EXCEEDED') {
        report.quotaRejected++
        this.quotaBlocked.add(id)
      } else {
        report.invalid++
        if (original.deleted === 1) {
          // Удалять на сервере нечего — просто забываем tombstone
          updates.set(id, (current) =>
            current && unchangedSince(current, original) ? { object: null } : {},
          )
        } else if (original.version > 0) {
          // Сервер не знает этот объект (например, данные на сервере удалены) — отправим как новый
          this.log('server does not know object, will re-create', id)
          updates.set(id, (current) => (current ? { object: { ...current, version: 0 } } : {}))
        } else {
          this.issues.set(id, 'INVALID')
          this.log('server rejected object as invalid', id)
        }
      }
    }
    await this.applyGuarded(epoch, updates)
    return outcome
  }

  /* ---------------------------------------------------------------- конфликты */

  async listConflicts(): Promise<ConflictView[]> {
    const conflicts = await this.store.listConflicts()
    const entries = await this.store.read(conflicts.map((conflict) => conflict.objectId))
    const views = await Promise.all(
      conflicts.map(async (conflict): Promise<ConflictView> => {
        const local = entries.get(conflict.objectId)?.object
        const ref = { objectId: conflict.objectId, kind: conflict.kind }
        const localCipher = local && local.deleted === 0 ? local.ciphertext : null
        const serverCipher = conflict.server.deleted ? null : conflict.server.ciphertext
        const localDeleted = localCipher === null
        const serverDeleted = serverCipher === null
        const [mine, theirs] = await Promise.all([
          localCipher === null ? null : this.codec.open(ref, localCipher),
          serverCipher === null ? null : this.codec.open(ref, serverCipher),
        ])
        return {
          objectId: conflict.objectId,
          detectedAt: conflict.detectedAt,
          local: {
            deleted: localDeleted,
            impact: mine,
            undecryptable: !localDeleted && mine === null,
            version: local?.version ?? 0,
            updatedAt: mine?.updatedAt ?? local?.updatedAt ?? null,
          },
          server: {
            deleted: serverDeleted,
            impact: theirs,
            undecryptable: !serverDeleted && theirs === null,
            version: conflict.server.version,
          },
          diff: mine && theirs ? diffImpacts(mine, theirs) : [],
          canKeepBoth: mine !== null && theirs !== null,
        }
      }),
    )
    return views.sort((a, b) => (a.detectedAt < b.detectedAt ? 1 : -1))
  }

  /**
   * Разрешение конфликта:
   * — local: локальная ветка перезапишет сервер (базовая версия = серверная, dirty);
   * — server: локальная заменяется серверной (или удаляется, если на сервере tombstone);
   * — both: серверная занимает objectId, локальная сохраняется НОВОЙ записью (новый objectId —
   *   перешифровка обязательна: AAD привязан к objectId) с пометкой copySuffix в заголовке.
   * Возвращает objectId копии для both.
   */
  async resolve(
    objectId: string,
    choice: ResolveChoice,
    copySuffix = ' (copy)',
  ): Promise<string | null> {
    const entry = (await this.store.read([objectId])).get(objectId)
    const conflict = entry?.conflict
    if (!conflict) throw new ConflictResolutionError('NO_CONFLICT')
    const now = this.now().toISOString()
    const serverDeleted = conflict.server.deleted || conflict.server.ciphertext === null

    const takeServer = (branch: ConflictRecord): LocalObject | null =>
      branch.server.deleted || branch.server.ciphertext === null
        ? null
        : {
            objectId,
            kind: branch.kind,
            ciphertext: branch.server.ciphertext,
            version: branch.server.version,
            dirty: 0,
            deleted: 0,
            updatedAt: now,
          }

    if (choice === 'server') {
      await this.store.apply(
        new Map<string, Updater>([
          [
            objectId,
            (_current, branch) => (branch ? { object: takeServer(branch), conflict: null } : {}),
          ],
        ]),
      )
      return null
    }

    if (choice === 'local') {
      await this.store.apply(
        new Map<string, Updater>([
          [
            objectId,
            (current, branch) => {
              if (!branch) return {}
              const localDeleted = !current || current.deleted === 1 || current.ciphertext === null
              if (localDeleted && (branch.server.deleted || branch.server.ciphertext === null)) {
                return { object: null, conflict: null }
              }
              if (localDeleted) {
                // «Оставить мою» для локального удаления — удалить и на сервере
                return {
                  object: {
                    objectId,
                    kind: branch.kind,
                    ciphertext: null,
                    version: branch.server.version,
                    dirty: 1,
                    deleted: 1,
                    updatedAt: now,
                  },
                  conflict: null,
                }
              }
              return {
                object: { ...current, version: branch.server.version, dirty: 1 },
                conflict: null,
              }
            },
          ],
        ]),
      )
      return null
    }

    const local = entry?.object
    if (!local || local.deleted === 1 || local.ciphertext === null || serverDeleted) {
      throw new ConflictResolutionError('KEEP_BOTH_UNAVAILABLE')
    }
    const expected = local.ciphertext
    const value = await this.codec.open({ objectId, kind: local.kind }, expected)
    if (!value) throw new ConflictResolutionError('UNDECRYPTABLE')
    const copyId = newId()
    const copy = copyImpact(value, copyId, copySuffix, this.now())
    const ciphertext = await this.codec.seal({ objectId: copyId, kind: local.kind }, copy)
    let applied = false
    await this.store.apply(
      new Map<string, Updater>([
        [
          objectId,
          (current, branch) => {
            if (!branch || current?.ciphertext !== expected) return {}
            applied = true
            return { object: takeServer(branch), conflict: null }
          },
        ],
        [
          copyId,
          () =>
            applied
              ? {
                  object: {
                    objectId: copyId,
                    kind: local.kind,
                    ciphertext,
                    version: 0,
                    dirty: 1,
                    deleted: 0,
                    updatedAt: copy.updatedAt,
                  },
                }
              : {},
        ],
      ]),
    )
    if (!applied) throw new ConflictResolutionError('CHANGED')
    return copyId
  }
}

function toChange(object: LocalObject): PushChange {
  return {
    objectId: object.objectId,
    kind: object.kind,
    baseVersion: object.version,
    ciphertext: object.deleted === 1 ? null : object.ciphertext,
  }
}
