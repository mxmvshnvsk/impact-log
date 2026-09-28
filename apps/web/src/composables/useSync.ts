import { computed, shallowRef, watch } from 'vue'
import { createSyncApi } from '@/api/sync'
import { i18n } from '@/i18n'
import {
  type ConflictView,
  createCodec,
  type ResolveChoice,
  SyncEngine,
  SyncRuntime,
  type SyncSnapshot,
  type SyncStatus,
} from '@/sync'
import { idbSyncStore } from '@/sync/idbStore'
import { broadcast, onVaultSignal } from '@/utils/vaultChannel'
import { masterCryptoKey, VaultChangedError } from '@/vault'
import { useEntitlements } from './useEntitlements'
import { onImpactsChanged, reloadImpacts } from './useImpacts'
import { useSession } from './useSession'
import { ensureVault, useVault } from './useVault'

/*
 * Синхронизация зашифрованных объектов с сервером (ADR-0007) — Vue-обёртка над движком (src/sync).
 * Синглтон модуля: один движок и одна среда выполнения на вкладку; между вкладками синхронизирует одна.
 * Аккаунт (useAccount) вызывает start() после входа и stop() при выходе; bootstrapAccount() — при старте.
 */
export type { ConflictView, ResolveChoice, SyncStatus }

const vault = useVault()
const entitlements = useEntitlements()
const session = useSession()

async function refreshScreens() {
  await reloadImpacts()
  broadcast({ type: 'impacts-changed' })
}

/** Каждый запрос синхронизации несёт Account ID хранилища (X-Impact-Account) — сверка с сессией на сервере */
const syncApi = createSyncApi(() => vault.account.value?.accountId ?? null)
const engine = new SyncEngine(idbSyncStore, syncApi, createCodec(masterCryptoKey))

const runtime = new SyncRuntime({
  engine,
  hasAccount: () => vault.account.value !== null,
  fetchEntitlements: syncApi.entitlements,
  currentProfile: () => entitlements.profile.value,
  applyProfile: (profile) => entitlements.setProfile(profile),
  onRemoteData: refreshScreens,
  watchLocalChanges(listener) {
    const offLocal = onImpactsChanged(listener)
    // Изменения в других вкладках: синхронизирует только вкладка-владелец блокировки
    const offOther = onVaultSignal((signal) => {
      if (signal.type === 'impacts-changed') listener()
    })
    return () => {
      offLocal()
      offOther()
    }
  },
  onSignedOut: () => session.markExpired(),
  // Другая вкладка сменила ключ хранилища — всё в этой вкладке устарело
  onVaultChanged: () => window.location.reload(),
})

// Сессия закончилась по данным аккаунта («выйти везде», 401 в его запросах) — синхронизации тоже нет
watch(session.state, (state) => {
  if (state === 'expired' && vault.account.value) runtime.markSignedOut()
})

const snapshot = shallowRef<SyncSnapshot>(runtime.state)
runtime.subscribe((state) => {
  snapshot.value = state
})

/*
 * id записей с конфликтом — для меток в журнале и на экране записи. Читаем только ключи из хранилища
 * конфликтов (без расшифровки) и только когда счётчик движка говорит, что конфликты есть.
 */
const conflictIds = shallowRef<ReadonlySet<string>>(new Set())
let conflictIdsTicket = 0

async function refreshConflictIds() {
  const ticket = ++conflictIdsTicket
  if (snapshot.value.conflicts === 0) {
    if (conflictIds.value.size > 0) conflictIds.value = new Set()
    return
  }
  try {
    const records = await idbSyncStore.listConflicts()
    if (ticket === conflictIdsTicket) {
      conflictIds.value = new Set(records.map((record) => record.objectId))
    }
  } catch (error) {
    console.warn('[sync] cannot read conflict ids', error)
  }
}

watch(
  () => [snapshot.value.conflicts, snapshot.value.lastSyncAt] as const,
  () => void refreshConflictIds(),
)

let bootstrapping: Promise<void> | null = null

/**
 * Один раз при старте приложения: есть аккаунт → проверить сессию (401 — 'signed-out', записи остаются
 * локально), подтянуть тариф и запустить синхронизацию. Не блокирует первый рендер.
 */
export function bootstrapAccount(): Promise<void> {
  bootstrapping ??= (async () => {
    await ensureVault()
    const account = vault.account.value
    if (!account) return
    const state = await session.refresh()
    if (state === 'expired') {
      runtime.markSignedOut()
      return
    }
    // Cookie другого пользователя — синхронизировать нельзя: данные этого хранилища под другим MK
    if (state === 'active' && session.user.value && session.user.value.id !== account.userId) {
      console.warn('[sync] session belongs to another account')
      runtime.markSignedOut()
      return
    }
    // 'unknown' — сеть недоступна: работаем локально, синхронизация сама попробует позже
    await runtime.start()
  })().catch((error) => {
    console.error('[sync] bootstrap failed', error)
  })
  return bootstrapping
}

async function resolveConflict(objectId: string, choice: ResolveChoice): Promise<void> {
  try {
    await engine.resolve(objectId, choice, i18n.global.t('sync.conflicts.copySuffix'))
  } catch (error) {
    // Ключ хранилища сменили в другой вкладке — решение не записано, вкладка устарела
    if (error instanceof VaultChangedError) window.location.reload()
    throw error
  }
  await refreshScreens()
  await runtime.notifyLocalChange()
  await refreshConflictIds()
}

export function useSync() {
  return {
    status: computed<SyncStatus>(() => snapshot.value.status),
    lastSyncAt: computed(() => snapshot.value.lastSyncAt),
    pending: computed(() => snapshot.value.pending),
    conflicts: computed(() => snapshot.value.conflicts),
    /** id объектов с неразрешённым конфликтом версий (пусто, пока конфликтов нет) */
    conflictIds: computed(() => conflictIds.value),
    quotaBlocked: computed(() => snapshot.value.quotaBlocked),
    lastError: computed(() => snapshot.value.lastError),
    retryAt: computed(() => snapshot.value.retryAt),
    usage: computed(() => snapshot.value.usage),
    start: () => runtime.start(),
    stop: () => runtime.stop(),
    syncNow: () => runtime.syncNow(),
    listConflicts: (): Promise<ConflictView[]> => engine.listConflicts(),
    resolveConflict,
  }
}
