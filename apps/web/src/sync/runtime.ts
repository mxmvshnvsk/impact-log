import type { EntitlementProfile, EntitlementsResponse } from '@impact-log/shared'
import { backoffDelay } from './backoff'
import { SyncAbortedError, type SyncEngine } from './engine'
import { errorCode, httpStatus } from './types'

/*
 * Среда выполнения синхронизации: когда запускать цикл движка и как показывать его состояние.
 * — триггеры: start(), локальные изменения (debounce 1.5 с), фокус / видимость / online, раз в минуту
 *   при видимой вкладке; offline → статус 'offline';
 * — ошибки сети и 5xx → экспоненциальный backoff до 5 минут; 401 → 'signed-out', цикл останавливается
 *   (данные остаются локально) до следующего start(); 409 ACCOUNT_MISMATCH (сессия другого аккаунта) →
 *   'error' без повторов, данные не трогаем; VAULT_CHANGED (другая вкладка сменила MK) → onVaultChanged;
 * — вкладки: синхронизирует одна — владелец Web Lock 'impact-log-sync' (без Web Locks — каждая сама),
 *   остальные получают её состояние и просят синхронизацию через BroadcastChannel.
 * Без window/document/navigator (node) триггеры окна и блокировка просто не подключаются.
 */
export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'signed-out' | 'error'

export type SyncSnapshot = {
  status: SyncStatus
  lastSyncAt: string | null
  /** Записей с неотправленными изменениями (без конфликтных) */
  pending: number
  conflicts: number
  /** Из pending: не приняты сервером из-за лимита тарифа */
  quotaBlocked: number
  /** Код последней ошибки (ERROR_CODES, NETWORK_ERROR, INVALID, TOO_LARGE, VAULT_LOCKED …) */
  lastError: string | null
  /** Когда будет автоматический повтор после ошибки */
  retryAt: string | null
  /** Использование на сервере (GET /api/entitlements) */
  usage: EntitlementsResponse['usage'] | null
}

export type RuntimeDeps = {
  engine: SyncEngine
  hasAccount(): boolean
  fetchEntitlements(): Promise<Pick<EntitlementsResponse, 'profile' | 'usage'>>
  currentProfile(): EntitlementProfile
  applyProfile(profile: EntitlementProfile): void
  /** Серверные изменения применены локально: перечитать записи и сообщить другим вкладкам */
  onRemoteData(): Promise<void> | void
  /** Подписка на локальные изменения записей (в этой и в других вкладках) */
  watchLocalChanges(listener: () => void): () => void
  /** Сервер ответил 401: сессии больше нет */
  onSignedOut?(): void
  /** Ключ хранилища сменили в другой вкладке: эта вкладка устарела */
  onVaultChanged?(): void
}

export type RuntimeOptions = {
  /** Имя BroadcastChannel; null — без связи вкладок */
  channel?: string | null
  /** false — не использовать Web Locks (каждый экземпляр синхронизирует сам) */
  useLocks?: boolean
  /** Логировать решения среды выполнения (по умолчанию — флаг в localStorage) */
  debug?: boolean
}

export const SYNC_LOCK = 'impact-log-sync'
export const SYNC_CHANNEL = 'impact-log-sync'
const LOCAL_DEBOUNCE_MS = 1_500
const PERIODIC_MS = 60_000
const FOCUS_MIN_INTERVAL_MS = 10_000
const ENTITLEMENTS_TTL_MS = 10 * 60_000
const LEADER_WAIT_MS = 150
const SYNCING_DELAY_MS = 250
const REMOTE_SYNC_TIMEOUT_MS = 60_000

type Message =
  | { type: 'state'; state: SyncSnapshot }
  | { type: 'hello' }
  | { type: 'request'; id: string }
  | { type: 'done'; id: string }
  | { type: 'start' }
  | { type: 'stop' }

const INITIAL: SyncSnapshot = {
  status: 'off',
  lastSyncAt: null,
  pending: 0,
  conflicts: 0,
  quotaBlocked: 0,
  lastError: null,
  retryAt: null,
  usage: null,
}

function readDebugFlag(): boolean {
  try {
    return globalThis.localStorage?.getItem('impact-log:sync-debug') === '1'
  } catch {
    return false
  }
}

const delay = <T>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))

export class SyncRuntime {
  private snapshot: SyncSnapshot = INITIAL
  private readonly listeners = new Set<(state: SyncSnapshot) => void>()
  private active = false
  /** 401 / сессия другого аккаунта: ждём нового входа (start) */
  private halted = false
  private haltReason: 'signed-out' | 'account-mismatch' | null = null
  private leader = false
  private lock: Promise<boolean> | null = null
  private releaseLock: (() => void) | null = null
  private startSettled = true
  private failures = 0
  private backoffUntil = 0
  private lastRunAt = 0
  private entitlementsAt = 0
  private debounceTimer: ReturnType<typeof setTimeout> | undefined
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private periodicTimer: ReturnType<typeof setInterval> | undefined
  private unwatchLocal: (() => void) | null = null
  private unbindWindow: (() => void) | null = null
  private readonly channel: BroadcastChannel | null
  private readonly waiters = new Map<string, () => void>()
  private readonly useLocks: boolean
  private readonly debugEnabled: boolean

  constructor(
    private readonly deps: RuntimeDeps,
    options: RuntimeOptions = {},
  ) {
    const name = options.channel === undefined ? SYNC_CHANNEL : options.channel
    this.channel =
      name && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(name) : null
    this.channel?.addEventListener('message', (event: MessageEvent<Message>) =>
      this.onMessage(event.data),
    )
    this.useLocks = options.useLocks ?? true
    this.debugEnabled = options.debug ?? readDebugFlag()
  }

  get state(): SyncSnapshot {
    return this.snapshot
  }

  /** Эта вкладка сейчас синхронизирует (владеет блокировкой) */
  get isLeader(): boolean {
    return this.leader
  }

  subscribe(listener: (state: SyncSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Включить синхронизацию (после входа / при старте приложения с живой сессией) */
  async start(announce = true): Promise<void> {
    if (!this.deps.hasAccount()) {
      this.patch({ status: 'off' })
      return
    }
    if (!this.active || this.halted) this.deps.engine.reset()
    this.active = true
    this.halted = false
    this.haltReason = null
    this.failures = 0
    this.backoffUntil = 0
    this.clearRetry()
    this.bind()
    if (announce) this.post({ type: 'start' })
    this.patch({ status: this.isOffline() ? 'offline' : 'syncing', lastError: null, retryAt: null })
    // Время последней синхронизации хранится на устройстве — показываем его и до первого цикла
    try {
      const { lastSyncAt } = await this.deps.engine.readState()
      await this.refreshCounts({ lastSyncAt })
    } catch {
      // хранилище недоступно — это покажет цикл
    }
    await this.refreshEntitlements(true)
    this.startSettled = false
    const leader = await Promise.race([this.acquire(), delay(LEADER_WAIT_MS, false)])
    this.startSettled = true
    if (!this.active) return
    if (leader) await this.run('start', true)
    else this.post({ type: 'hello' })
  }

  /** Выключить (выход из аккаунта): локальные данные остаются, состояние — 'off' */
  stop(announce = true): void {
    if (announce) this.post({ type: 'stop' })
    this.active = false
    this.halted = false
    this.haltReason = null
    this.deps.engine.reset()
    this.unbind()
    if (this.releaseLock) this.releaseLock()
    else this.leader = false
    this.patch({ ...INITIAL })
  }

  /** Сессии нет (401 при старте, «выйти везде»): циклы не идут до следующего start() */
  markSignedOut(): void {
    if (this.halted && this.snapshot.status === 'signed-out') return
    this.halted = true
    this.haltReason = 'signed-out'
    this.clearRetry()
    this.patch({ status: 'signed-out', lastError: null, retryAt: null })
  }

  /** Синхронизировать сейчас (кнопка): без ожидания backoff; во вкладке-«наблюдателе» — через владельца */
  async syncNow(): Promise<void> {
    if (!this.active) {
      if (!this.halted) await this.start()
      return
    }
    // Остановились из-за чужой сессии — «Синхронизировать сейчас» проверяет заново (вдруг уже вошли)
    if (this.halted && this.haltReason === 'account-mismatch') {
      await this.start()
      return
    }
    if (this.halted) return
    if (!this.leader) {
      await this.askLeader()
      return
    }
    this.failures = 0
    this.backoffUntil = 0
    await this.run('manual', true)
  }

  /** Локальное хранилище изменено не через записи (разрешение конфликта) — пересчитать и синхронизировать */
  async notifyLocalChange(): Promise<void> {
    if (!this.active || this.halted) return
    if (this.leader) {
      await this.refreshCounts()
      await this.run('resolution', true)
    } else {
      await this.askLeader()
    }
  }

  /** Освободить ресурсы (node-проверка) */
  dispose(): void {
    this.stop(false)
    this.channel?.close()
  }

  /* ---------------------------------------------------------------- цикл */

  private async run(reason: string, force = false): Promise<void> {
    if (!this.active || this.halted || !this.leader) {
      this.debug('skip', { reason, active: this.active, halted: this.halted, leader: this.leader })
      return
    }
    if (!force && Date.now() < this.backoffUntil) {
      this.debug('skip: backoff', { reason, until: new Date(this.backoffUntil).toISOString() })
      return
    }
    if (this.isOffline()) {
      this.patch({ status: 'offline' })
      return
    }
    this.debug('run', { reason, force })
    clearTimeout(this.debounceTimer)
    // Короткие циклы не мигают индикатором: «синхронизация…» — только если цикл идёт дольше 250 мс
    const syncing = setTimeout(() => this.patch({ status: 'syncing' }), SYNCING_DELAY_MS)
    try {
      const report = await this.deps.engine.sync()
      clearTimeout(syncing)
      this.debug('cycle done', report)
      this.lastRunAt = Date.now()
      this.failures = 0
      this.backoffUntil = 0
      this.clearRetry()
      if (report.localChanged) await this.deps.onRemoteData()
      const { lastSyncAt } = await this.deps.engine.readState()
      const issue = this.deps.engine.listIssues()[0]
      await this.refreshCounts({
        status: 'idle',
        lastSyncAt,
        lastError: issue ? issue.code : null,
        retryAt: null,
      })
      // Сервер отказал по квоте — возможно, тариф уже другой
      if (report.quotaRejected > 0 && (await this.refreshEntitlements(true)))
        void this.run('entitlements', true)
    } catch (error) {
      clearTimeout(syncing)
      await this.fail(error)
    }
  }

  private async fail(error: unknown): Promise<void> {
    this.debug('cycle failed', error)
    if (error instanceof SyncAbortedError) return
    const status = httpStatus(error)
    if (status === 401) {
      this.halted = true
      this.haltReason = 'signed-out'
      this.clearRetry()
      this.patch({ status: 'signed-out', lastError: null, retryAt: null })
      this.deps.onSignedOut?.()
      return
    }
    const code = errorCode(error)
    if (status === 409 && code === 'ACCOUNT_MISMATCH') {
      // Cookie сессии — другого аккаунта: повторять бессмысленно, локальные данные не трогаем
      this.halted = true
      this.haltReason = 'account-mismatch'
      this.clearRetry()
      console.warn('[sync] session belongs to another account, sync stopped')
      await this.refreshCounts({ status: 'error', lastError: code, retryAt: null })
      return
    }
    if (code === 'VAULT_CHANGED') {
      this.halted = true
      this.clearRetry()
      this.deps.onVaultChanged?.()
      return
    }
    if (code === 'VAULT_LOCKED') {
      await this.refreshCounts({ status: 'error', lastError: code, retryAt: null }).catch(() => {})
      return
    }
    this.failures++
    const wait = backoffDelay(this.failures)
    this.backoffUntil = Date.now() + wait
    this.clearRetry()
    this.retryTimer = setTimeout(() => void this.run('retry'), wait)
    const offline = status === 0 || this.isOffline()
    if (!offline) console.warn('[sync] cycle failed', error)
    await this.refreshCounts({
      status: offline ? 'offline' : 'error',
      lastError: offline ? null : code,
      retryAt: new Date(this.backoffUntil).toISOString(),
    })
  }

  private async refreshCounts(extra: Partial<SyncSnapshot> = {}): Promise<void> {
    try {
      this.patch({ ...extra, ...(await this.deps.engine.counts()) })
    } catch {
      this.patch(extra)
    }
  }

  private async refreshEntitlements(force = false): Promise<boolean> {
    if (!force && Date.now() - this.entitlementsAt < ENTITLEMENTS_TTL_MS) return false
    this.entitlementsAt = Date.now()
    try {
      const previous = this.deps.currentProfile()
      const { profile, usage } = await this.deps.fetchEntitlements()
      this.deps.applyProfile(profile)
      this.patch({ usage })
      const changed =
        previous.planId !== profile.planId ||
        previous.revision !== profile.revision ||
        previous.limits.maxActiveImpacts !== profile.limits.maxActiveImpacts ||
        previous.limits.maxStorageBytes !== profile.limits.maxStorageBytes ||
        previous.limits.maxObjects !== profile.limits.maxObjects
      if (changed) this.deps.engine.releaseQuota()
      return changed
    } catch {
      return false // офлайн или нет сессии — это покажет сам цикл синхронизации
    }
  }

  /* ---------------------------------------------------------------- триггеры */

  private bind(): void {
    this.unwatchLocal ??= this.deps.watchLocalChanges(() => this.onLocalChange())
    this.periodicTimer ??= setInterval(() => {
      if (this.isVisible()) void this.run('periodic')
    }, PERIODIC_MS)
    if (this.unbindWindow || typeof window === 'undefined') return
    const online = () => {
      this.failures = 0
      this.backoffUntil = 0
      void this.run('online', true)
    }
    const offline = () => {
      if (this.active && !this.halted) this.patch({ status: 'offline' })
    }
    const focus = () => this.onFocus()
    const visibility = () => {
      if (this.isVisible()) this.onFocus()
    }
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', visibility)
    this.unbindWindow = () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', visibility)
    }
  }

  private unbind(): void {
    this.unwatchLocal?.()
    this.unwatchLocal = null
    this.unbindWindow?.()
    this.unbindWindow = null
    clearInterval(this.periodicTimer)
    this.periodicTimer = undefined
    clearTimeout(this.debounceTimer)
    this.clearRetry()
  }

  private clearRetry(): void {
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
  }

  private onLocalChange(): void {
    this.debug('local change', { leader: this.leader })
    if (!this.active || this.halted || !this.leader) return
    void this.refreshCounts()
    clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => void this.run('local'), LOCAL_DEBOUNCE_MS)
  }

  private onFocus(): void {
    if (!this.active || this.halted || !this.leader) return
    if (Date.now() - this.lastRunAt < FOCUS_MIN_INTERVAL_MS) return
    void this.refreshEntitlements().then((changed) => {
      if (changed) void this.run('entitlements', true)
    })
    void this.run('focus')
  }

  private isOffline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false
  }

  private isVisible(): boolean {
    return typeof document === 'undefined' || document.visibilityState === 'visible'
  }

  /* ---------------------------------------------------------------- вкладки */

  private acquire(): Promise<boolean> {
    if (this.leader) return Promise.resolve(true)
    const locks =
      this.useLocks && typeof navigator !== 'undefined' && 'locks' in navigator
        ? navigator.locks
        : undefined
    if (!locks) {
      this.leader = true
      return Promise.resolve(true)
    }
    this.lock ??= new Promise<boolean>((granted) => {
      locks
        .request(
          SYNC_LOCK,
          () =>
            new Promise<void>((release) => {
              this.releaseLock = release
              this.leader = true
              granted(true)
              if (!this.active) release()
              // Прежний владелец закрыл вкладку — продолжаем за него
              else if (this.startSettled) void this.run('leader', true)
            }),
        )
        .catch(() => granted(false))
        .finally(() => {
          this.leader = false
          this.lock = null
          this.releaseLock = null
        })
    })
    return this.lock
  }

  private askLeader(): Promise<void> {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id)
        resolve()
      }, REMOTE_SYNC_TIMEOUT_MS)
      this.waiters.set(id, () => {
        clearTimeout(timer)
        resolve()
      })
      this.post({ type: 'request', id })
    })
  }

  private onMessage(message: Message): void {
    if (message.type !== 'state') this.debug('message', message)
    switch (message.type) {
      case 'state':
        if (this.active && !this.leader) this.emit({ ...message.state })
        break
      case 'hello':
        if (this.active && this.leader) this.post({ type: 'state', state: this.snapshot })
        break
      case 'request':
        if (this.active && this.leader) {
          void this.run('tab', true).then(() => this.post({ type: 'done', id: message.id }))
        }
        break
      case 'done':
        this.waiters.get(message.id)?.()
        this.waiters.delete(message.id)
        break
      case 'start':
        if (!this.active || this.halted) void this.start(false)
        break
      case 'stop':
        if (this.active) this.stop(false)
        break
    }
  }

  /** Отладка: localStorage['impact-log:sync-debug'] = '1' — события среды выполнения в консоль */
  private debug(message: string, details?: unknown): void {
    if (this.debugEnabled) console.debug(`[sync] ${message}`, details ?? '')
  }

  private post(message: Message): void {
    this.channel?.postMessage(message)
  }

  private patch(next: Partial<SyncSnapshot>): void {
    this.emit({ ...this.snapshot, ...next })
    if (this.active && this.leader) this.post({ type: 'state', state: this.snapshot })
  }

  private emit(state: SyncSnapshot): void {
    this.snapshot = state
    for (const listener of this.listeners) listener(state)
  }
}
