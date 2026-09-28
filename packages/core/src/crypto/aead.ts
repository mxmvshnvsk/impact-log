import { concatBytes, randomBytes, toArrayBuffer } from './encoding'
import { CryptoError } from './errors'

/**
 * AEAD: AES-256-GCM из WebCrypto (стандартная реализация браузера / Node).
 * Нонс 96 бит — случайный, ключи одноразовые или с малым числом сообщений (DEK на объект),
 * поэтому риск повтора нонса пренебрежимо мал.
 */
export const KEY_BYTES = 32
export const NONCE_BYTES = 12

export type AeadKey = Uint8Array | CryptoKey

async function asCryptoKey(key: AeadKey): Promise<CryptoKey> {
  if (!(key instanceof Uint8Array)) return key
  if (key.length !== KEY_BYTES) throw new CryptoError('bad key length')
  return globalThis.crypto.subtle.importKey('raw', toArrayBuffer(key), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

/** Импорт сырого ключа один раз (например, MK на время разблокировки) */
export function importAeadKey(raw: Uint8Array): Promise<CryptoKey> {
  return asCryptoKey(raw)
}

export function generateKey(): Uint8Array {
  return randomBytes(KEY_BYTES)
}

/** Шифрование: результат = nonce ‖ ciphertext+tag */
export async function seal(
  key: AeadKey,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const nonce = randomBytes(NONCE_BYTES)
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(nonce), additionalData: toArrayBuffer(aad) },
    await asCryptoKey(key),
    toArrayBuffer(plaintext),
  )
  return concatBytes(nonce, new Uint8Array(ciphertext))
}

export async function open(key: AeadKey, sealed: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
  if (sealed.length < NONCE_BYTES + 16) throw new CryptoError()
  try {
    const plaintext = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(sealed.subarray(0, NONCE_BYTES)),
        additionalData: toArrayBuffer(aad),
      },
      await asCryptoKey(key),
      toArrayBuffer(sealed.subarray(NONCE_BYTES)),
    )
    return new Uint8Array(plaintext)
  } catch {
    throw new CryptoError()
  }
}
