import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { encodeBase32LowerCaseNoPadding } from '@oslojs/encoding'

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Случайный токен сессии: 160 бит, base32 */
export function generateToken(): string {
  return encodeBase32LowerCaseNoPadding(randomBytes(20))
}

/**
 * AES-256-GCM. Формат: iv.tag.ciphertext (base64url).
 * Используется для TOTP-секретов: утечка дампа БД без ключа из env не даёт генерировать коды.
 */
export function createCipher(hexKey: string) {
  const key = Buffer.from(hexKey, 'hex')

  function encrypt(plain: Uint8Array): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const data = Buffer.concat([cipher.update(plain), cipher.final()])
    return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url')).join('.')
  }

  function decrypt(payload: string): Uint8Array {
    const [iv, tag, data] = payload.split('.').map((part) => Buffer.from(part, 'base64url'))
    if (!iv || !tag || !data) throw new Error('Malformed ciphertext')
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return new Uint8Array(Buffer.concat([decipher.update(data), decipher.final()]))
  }

  return { encrypt, decrypt }
}

export type Cipher = ReturnType<typeof createCipher>
