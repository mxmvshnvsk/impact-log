import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { encodeBase32LowerCaseNoPadding } from '@oslojs/encoding'

export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

export function hmacSha256(key: Uint8Array, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest()
}

/** Сравнение hex-хешей за постоянное время (строки разной длины — просто false) */
export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right)
}

/** base64url (без паддинга) → байты. Формат уже проверен zod-схемой */
export function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

/**
 * Независимый подключ из серверного секрета (HKDF-SHA256 с отдельной меткой):
 * один секрет из env — несколько ключей для разных целей, которые не выводятся друг из друга.
 */
export function deriveServerKey(hexSecret: string, label: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(hexSecret, 'hex'), Buffer.alloc(0), label, 32))
}

/** Случайный токен сессии / доверенного устройства: 160 бит, base32 */
export function generateToken(): string {
  return encodeBase32LowerCaseNoPadding(randomBytes(20))
}

const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const ACCOUNT_ID_LENGTH = 12

/** Публичный ID аккаунта: 60 случайных бит → 12 символов Crockford Base32. Ничего не кодирует */
export function generateAccountId(): string {
  let bits = randomBytes(8).readBigUInt64BE() >> 4n
  let id = ''
  for (let i = 0; i < ACCOUNT_ID_LENGTH; i++) {
    id = CROCKFORD_BASE32[Number(bits & 31n)] + id
    bits >>= 5n
  }
  return id
}

/** Метка HKDF для ключа шифрования TOTP-секретов (отдельно от ключа «фальшивой» соли prelogin) */
export const TOTP_SECRET_KEY_LABEL = 'impact-log/v1/totp-secret'

const TOTP_FORMAT_PREFIX = 'v2:'
const GCM_IV_BYTES = 12
const GCM_TAG_BYTES = 16

/**
 * AES-256-GCM для TOTP-секретов: утечка дампа БД без ключа из env не даёт генерировать коды.
 * - ключ — HKDF(TOTP_ENCRYPTION_KEY, TOTP_SECRET_KEY_LABEL), не сам секрет из env (разделение ключей);
 * - AAD — id пользователя: шифротекст нельзя переставить в строку другого пользователя;
 * - тег всегда 16 байт (authTagLength фиксирован — укороченный тег не примется);
 * - формат `v2:` + iv.tag.ciphertext (base64url). Другие форматы не расшифровываются.
 */
export function createTotpCipher(hexSecret: string) {
  const key = deriveServerKey(hexSecret, TOTP_SECRET_KEY_LABEL)

  function encrypt(plain: Uint8Array, aad: string): string {
    const iv = randomBytes(GCM_IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: GCM_TAG_BYTES })
    cipher.setAAD(Buffer.from(aad, 'utf8'))
    const data = Buffer.concat([cipher.update(plain), cipher.final()])
    const parts = [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url'))
    return `${TOTP_FORMAT_PREFIX}${parts.join('.')}`
  }

  function decrypt(payload: string, aad: string): Uint8Array {
    if (!payload.startsWith(TOTP_FORMAT_PREFIX)) throw new Error('Unsupported ciphertext format')
    const parts = payload.slice(TOTP_FORMAT_PREFIX.length).split('.')
    const [iv, tag, data] = parts.map((part) => Buffer.from(part, 'base64url'))
    if (
      parts.length !== 3 ||
      !iv ||
      !tag ||
      !data ||
      iv.length !== GCM_IV_BYTES ||
      tag.length !== GCM_TAG_BYTES
    ) {
      throw new Error('Malformed ciphertext')
    }
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: GCM_TAG_BYTES })
    decipher.setAAD(Buffer.from(aad, 'utf8'))
    decipher.setAuthTag(tag)
    return new Uint8Array(Buffer.concat([decipher.update(data), decipher.final()]))
  }

  return { encrypt, decrypt }
}

export type Cipher = ReturnType<typeof createTotpCipher>

/** Секрет устройства: 32 случайных байта (base64url) — клиенту; в БД — только SHA-256 от байтов */
export function generateDeviceSecret(): { secret: string; hash: string } {
  const bytes = randomBytes(32)
  return { secret: bytes.toString('base64url'), hash: sha256Hex(bytes) }
}

/** Хеш предъявленного секрета устройства (от байтов — у base64url есть «лишние» биты в хвосте) */
export function deviceSecretHash(secret: string): string {
  return sha256Hex(decodeBase64Url(secret))
}
