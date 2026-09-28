import { concatBytes, randomBytes, toBase64Url, utf8 } from './encoding'
import { hkdf, sha256 } from './kdf'

/**
 * Recovery Key, формат ILRK1 (ADR-0006, заморожен тест-векторами):
 *
 *   ILRK1-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-CC
 *
 * — 20 байт (160 бит) из CSPRNG → 32 символа Crockford Base32 (без I, L, O, U);
 * — CC — контрольная сумма 10 бит: первые 10 бит SHA-256("ILRK1" ‖ bytes), 2 символа Base32.
 *   Ловит опечатки ДО попытки вывода ключа; секретной энтропии не добавляет;
 * — дефисы и регистр — только оформление, при разборе игнорируются; O→0, I/L→1.
 *
 * Из ключа выводятся (HKDF-SHA256; memory-hard KDF не нужен — 160 бит энтропии):
 * — RecoveryKEK (с солью конверта) — оборачивает Master Key;
 * — recoveryAuthKey — доказывает серверу владение ключом при сбросе пароля. Сервер хранит только его хеш.
 */
export const RECOVERY_PREFIX = 'ILRK1'
export const RECOVERY_BYTES = 20
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const INFO_RECOVERY_KEK = 'impact-log/v1/recovery-kek'
export const INFO_RECOVERY_AUTH = 'impact-log/v1/recovery-auth'

export class RecoveryKeyError extends Error {
  constructor(readonly reason: 'format' | 'checksum') {
    super(`invalid recovery key: ${reason}`)
    this.name = 'RecoveryKeyError'
  }
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += CROCKFORD_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += CROCKFORD_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(text: string): Uint8Array {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of text) {
    const index = CROCKFORD_ALPHABET.indexOf(char)
    if (index < 0) throw new RecoveryKeyError('format')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

async function checksum(bytes: Uint8Array): Promise<string> {
  const hash = await sha256(concatBytes(utf8.encode(RECOVERY_PREFIX), bytes))
  const h0 = hash[0] ?? 0
  const h1 = hash[1] ?? 0
  return (
    (CROCKFORD_ALPHABET[h0 >> 3] ?? '') + (CROCKFORD_ALPHABET[((h0 & 7) << 2) | (h1 >> 6)] ?? '')
  )
}

export async function encodeRecoveryKey(bytes: Uint8Array): Promise<string> {
  if (bytes.length !== RECOVERY_BYTES) throw new RecoveryKeyError('format')
  const body = base32Encode(bytes) + (await checksum(bytes))
  return [RECOVERY_PREFIX, ...(body.match(/.{1,4}/g) ?? [])].join('-')
}

export async function generateRecoveryKey(): Promise<{ secret: Uint8Array; text: string }> {
  const secret = randomBytes(RECOVERY_BYTES)
  return { secret, text: await encodeRecoveryKey(secret) }
}

/** Разбор введённого пользователем ключа. Бросает RecoveryKeyError('format' | 'checksum') */
export async function parseRecoveryKey(input: string): Promise<Uint8Array> {
  const compact = input.toUpperCase().replace(/[\s\-_.]/g, '')
  if (!compact.startsWith(RECOVERY_PREFIX)) throw new RecoveryKeyError('format')
  const body = compact.slice(RECOVERY_PREFIX.length).replace(/O/g, '0').replace(/[IL]/g, '1')
  if (body.length !== 34) throw new RecoveryKeyError('format')
  const bytes = base32Decode(body.slice(0, 32))
  if (bytes.length !== RECOVERY_BYTES) throw new RecoveryKeyError('format')
  if ((await checksum(bytes)) !== body.slice(32)) throw new RecoveryKeyError('checksum')
  return bytes
}

export async function deriveRecoveryKek(secret: Uint8Array, salt: Uint8Array): Promise<Uint8Array> {
  return hkdf(secret, INFO_RECOVERY_KEK, salt)
}

export async function deriveRecoveryAuthKey(secret: Uint8Array): Promise<string> {
  return toBase64Url(await hkdf(secret, INFO_RECOVERY_AUTH))
}
