import {
  compareImpactsDesc,
  createImpact,
  type Impact,
  type ImpactInput,
  updateImpact,
} from '@impact-log/core'
import { canCreateImpact } from '@impact-log/shared'
import { computed, readonly, ref, shallowRef } from 'vue'
import { broadcast, onVaultSignal } from '@/utils/vaultChannel'
import { impactRepository, VaultChangedError } from '@/vault'
import { useEntitlements } from './useEntitlements'

/*
 * Записи impact log: реактивный список активных записей + CRUD поверх зашифрованного репозитория.
 * Все экраны читают записи только отсюда. Синглтон модуля.
 */

/** Создание сверх лимита тарифа (entitlements) — квота ограничивает только создание */
export class QuotaExceededError extends Error {
  constructor(readonly limit: number) {
    super('ACTIVE_IMPACT_LIMIT')
  }
}

export type ImportMode = 'merge' | 'skip-existing'
export type ImportResult = { added: number; updated: number; skipped: number }

const items = shallowRef<Impact[]>([])
const ready = ref(false)
const undecryptable = ref(0)
let loading: Promise<void> | null = null

type ChangeListener = () => void
const listeners = new Set<ChangeListener>()

/** Подписка на локальные изменения (для движка синхронизации): после create/update/remove/import */
export function onImpactsChanged(listener: ChangeListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify() {
  for (const listener of listeners) listener()
  broadcast({ type: 'impacts-changed' })
}

/**
 * Другая вкладка сменила ключ хранилища (вход в аккаунт): эта вкладка работает со старым MK, запись
 * отклонена целиком (в хранилище ничего не записано). Данные на экране устарели — перезагружаемся.
 */
function reloadOnVaultChange<T>(task: Promise<T>): Promise<T> {
  return task.catch((error: unknown) => {
    if (error instanceof VaultChangedError) window.location.reload()
    throw error
  })
}

function commit(next: Impact[]) {
  items.value = [...next].sort(compareImpactsDesc)
}

async function load(): Promise<void> {
  const list = await impactRepository.list()
  undecryptable.value = impactRepository.undecryptable
  commit(list)
  ready.value = true
}

/** Перечитать записи из хранилища (после pull синхронизации, смены MK, изменений в другой вкладке) */
export function reloadImpacts(): Promise<void> {
  loading = load()
  return loading
}

onVaultSignal((signal) => {
  if (signal.type === 'impacts-changed' && ready.value) void reloadImpacts()
})

/** Сбросить состояние (хранилище стёрто) */
export function resetImpacts(): void {
  items.value = []
  ready.value = false
  loading = null
}

export function useImpacts() {
  const { profile } = useEntitlements()
  loading ??= load().catch((error) => {
    loading = null
    throw error
  })

  function get(id: string): Impact | undefined {
    return items.value.find((impact) => impact.objectId === id)
  }

  async function create(input: ImpactInput): Promise<Impact> {
    const decision = canCreateImpact(profile.value, items.value.length)
    if (!decision.allowed) throw new QuotaExceededError(decision.limit)
    const impact = createImpact(input)
    await reloadOnVaultChange(impactRepository.save(impact))
    commit([...items.value, impact])
    notify()
    return impact
  }

  async function update(id: string, input: ImpactInput): Promise<Impact> {
    const current = get(id) ?? (await impactRepository.get(id))
    if (!current) throw new Error('NOT_FOUND')
    const next = updateImpact(current, input)
    await reloadOnVaultChange(impactRepository.save(next))
    commit(items.value.map((impact) => (impact.objectId === id ? next : impact)))
    notify()
    return next
  }

  async function remove(id: string): Promise<void> {
    await reloadOnVaultChange(impactRepository.remove(id))
    commit(items.value.filter((impact) => impact.objectId !== id))
    notify()
  }

  /**
   * Импорт (JSON-экспорт, другое устройство): merge — более новый updatedAt побеждает.
   * Квота на импорт не распространяется: это перенос собственных данных, а не создание новых.
   */
  async function importMany(incoming: Impact[], mode: ImportMode = 'merge'): Promise<ImportResult> {
    const result: ImportResult = { added: 0, updated: 0, skipped: 0 }
    const byId = new Map(items.value.map((impact) => [impact.objectId, impact]))
    for (const impact of incoming) {
      const existing = byId.get(impact.objectId)
      const replace = !existing || (mode === 'merge' && impact.updatedAt > existing.updatedAt)
      if (!replace) {
        result.skipped++
        continue
      }
      await reloadOnVaultChange(impactRepository.save(impact))
      byId.set(impact.objectId, impact)
      if (existing) result.updated++
      else result.added++
    }
    commit([...byId.values()])
    if (result.added + result.updated > 0) notify()
    return result
  }

  return {
    impacts: readonly(items),
    ready: readonly(ready),
    /** Сколько записей не удалось расшифровать (повреждение, чужой ключ) — показать предупреждение */
    undecryptable: readonly(undecryptable),
    count: computed(() => items.value.length),
    /**
     * Тот же список, что impacts, но без DeepReadonly-типов — чтобы передавать в функции ядра
     * (filterImpacts, summarize, …). Мутировать нельзя так же, как impacts (добавлено web-core).
     */
    list: computed<readonly Impact[]>(() => items.value),
    /** Промис первой загрузки (для экранов, которым нужны данные до рендера) */
    whenReady: () => loading ?? Promise.resolve(),
    get,
    create,
    update,
    remove,
    importMany,
    reload: reloadImpacts,
  }
}
