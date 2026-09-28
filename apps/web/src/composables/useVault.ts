import { computed, readonly, ref, shallowRef } from 'vue'
import { broadcast, onVaultSignal } from '@/utils/vaultChannel'
import {
  type AdoptOptions,
  type AdoptResult,
  adoptMasterKey as adoptVaultMasterKey,
  createVault,
  destroyVault,
  type KdfPin,
  loadVault,
  updateVaultRecord,
  type VaultAccount,
  type VaultBinding,
  type VaultRecord,
} from '@/vault'
import { reloadImpacts, resetImpacts } from './useImpacts'

/*
 * Локальное хранилище (vault) — корень local-first приложения: MK, зашифрованные записи в IndexedDB,
 * ключ устройства. Аккаунт синхронизации опционален (info.account).
 * Синглтон модуля, как useSession (ADR-0002): без Pinia.
 */
export type VaultStatus = 'loading' | 'none' | 'ready' | 'unavailable'
export type { KdfPin, VaultAccount }
export type VaultInfo = Pick<VaultRecord, 'vaultId' | 'createdAt' | 'account'>

const status = ref<VaultStatus>('loading')
const record = shallowRef<VaultRecord | null>(null)
let loading: Promise<void> | null = null

function applyRecord(next: VaultRecord | null) {
  record.value = next
  status.value = next ? 'ready' : 'none'
}

/** Открывает хранилище один раз при старте (router guard) */
export function ensureVault(): Promise<void> {
  loading ??= loadVault()
    .then(applyRecord)
    .catch((error) => {
      console.error('[vault] unavailable', error)
      record.value = null
      status.value = 'unavailable'
    })
  return loading
}

/**
 * Просим браузер не вытеснять хранилище при нехватке места (best effort: браузер может отказать
 * или спросить пользователя сам — ошибок в интерфейсе не показываем)
 */
function requestPersistentStorage() {
  try {
    void navigator.storage?.persist?.().catch(() => undefined)
  } catch {
    // API нет — ничего не делаем
  }
}

// Другая вкладка создала/стёрла хранилище или сменила аккаунт — проще всего перезагрузиться
onVaultSignal((signal) => {
  if (signal.type === 'vault-changed' || signal.type === 'vault-destroyed') {
    window.location.reload()
  }
})

export function useVault() {
  /** Новое хранилище на этом устройстве (онбординг без регистрации или первый вход в аккаунт) */
  async function create(masterKey?: Uint8Array, binding?: VaultBinding): Promise<void> {
    applyRecord(await createVault(masterKey, binding))
    resetImpacts()
    loading = Promise.resolve()
    requestPersistentStorage()
    broadcast({ type: 'vault-changed' })
  }

  /** Стирает локальные данные этого устройства (данные на сервере не трогает) */
  async function destroy(): Promise<void> {
    await destroyVault()
    resetImpacts()
    applyRecord(null)
    loading = Promise.resolve()
    broadcast({ type: 'vault-destroyed' })
  }

  function requireVault() {
    if (!record.value) throw new Error('NO_VAULT')
  }

  /** Привязать/отвязать аккаунт синхронизации */
  async function setAccount(account: VaultAccount | null): Promise<void> {
    requireVault()
    record.value = await updateVaultRecord((current) => ({ ...current, account }))
  }

  /** Привязка к аккаунту и TOFU-параметры KDF — одной записью */
  async function bind(account: VaultAccount, kdfPin?: KdfPin): Promise<void> {
    requireVault()
    record.value = await updateVaultRecord((current) => ({
      ...current,
      account,
      ...(kdfPin ? { kdfPin } : {}),
    }))
  }

  /** Соль и параметры KDF поменялись на этом устройстве (смена пароля) */
  async function setKdfPin(kdfPin: KdfPin): Promise<void> {
    requireVault()
    record.value = await updateVaultRecord((current) => ({ ...current, kdfPin }))
  }

  /**
   * Перейти на MK аккаунта атомарно (локальные записи переоборачиваются и станут новыми для сервера,
   * нерасшифровываемые — в карантин; discardLocal — стереть их). Привязка аккаунта — в той же транзакции.
   */
  async function adoptMasterKey(
    masterKey: Uint8Array,
    options: AdoptOptions,
  ): Promise<AdoptResult> {
    requireVault()
    const result = await adoptVaultMasterKey(masterKey, options)
    record.value = result.record
    await reloadImpacts()
    return result
  }

  return {
    status: readonly(status),
    info: computed<VaultInfo | null>(() =>
      record.value
        ? {
            vaultId: record.value.vaultId,
            createdAt: record.value.createdAt,
            account: record.value.account,
          }
        : null,
    ),
    account: computed(() => record.value?.account ?? null),
    kdfPin: computed(() => record.value?.kdfPin ?? null),
    hasVault: computed(() => status.value === 'ready'),
    create,
    destroy,
    setAccount,
    bind,
    setKdfPin,
    adoptMasterKey,
  }
}
