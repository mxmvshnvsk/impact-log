import { importAeadKey, toBase64Url, utf8 } from '@impact-log/core/crypto'

/*
 * Master Key в памяти вкладки, пока хранилище открыто. Сырые байты нужны, чтобы создавать конверты
 * (пароль, Recovery Key, устройство); для шифрования объектов используем импортированный CryptoKey.
 * Рядом — отпечаток MK: по нему запись в хранилище проверяет, что другая вкладка не сменила ключ.
 */
export class VaultLockedError extends Error {
  constructor() {
    super('VAULT_LOCKED')
  }
}

/** Ключ хранилища сменили (другая вкладка вошла в аккаунт): запись старым ключом отклонена — перезагрузка */
export class VaultChangedError extends Error {
  constructor() {
    super('VAULT_CHANGED')
    this.name = 'VaultChangedError'
  }
}

const MK_ID_LABEL = 'impact-log/v1/mk-id'
const MK_ID_BYTES = 16

/**
 * Отпечаток MK: первые 16 байт HMAC-SHA256(MK, 'impact-log/v1/mk-id'), base64url. Необратим и не даёт
 * ничего для расшифровки; лежит в записи хранилища рядом с конвертом устройства.
 */
export async function masterKeyId(masterKey: Uint8Array): Promise<string> {
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    masterKey.slice(),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, utf8.encode(MK_ID_LABEL)))
  return toBase64Url(mac.slice(0, MK_ID_BYTES))
}

let raw: Uint8Array | null = null
let key: CryptoKey | null = null
let id: string | null = null

export async function setMasterKey(masterKey: Uint8Array): Promise<void> {
  const [imported, fingerprint] = await Promise.all([
    importAeadKey(masterKey),
    masterKeyId(masterKey),
  ])
  clearMasterKey()
  raw = masterKey.slice()
  key = imported
  id = fingerprint
}

export function clearMasterKey(): void {
  raw?.fill(0)
  raw = null
  key = null
  id = null
}

export function hasMasterKey(): boolean {
  return key !== null
}

/** CryptoKey MK — для encryptObject/decryptObject */
export function masterCryptoKey(): CryptoKey {
  if (!key) throw new VaultLockedError()
  return key
}

/** Отпечаток MK, открытого в этой вкладке */
export function masterKeyFingerprint(): string {
  if (!id) throw new VaultLockedError()
  return id
}

/** Ключ и его отпечаток одним снимком: шифруем этим ключом и проверяем в транзакции именно его отпечаток */
export function masterKeySnapshot(): { key: CryptoKey; id: string } {
  if (!key || !id) throw new VaultLockedError()
  return { key, id }
}

/** Копия сырых байтов MK — только для создания конвертов; вызывающий код обнуляет копию после использования */
export function masterKeyBytes(): Uint8Array {
  if (!raw) throw new VaultLockedError()
  return raw.slice()
}
