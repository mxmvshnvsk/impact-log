import { argon2id } from 'hash-wasm'
import { toArrayBuffer, utf8 } from './encoding'

/**
 * KDF:
 * — пароль → Argon2id (memory-hard, параметры версионируются и хранятся в конверте);
 * — высокоэнтропийные секреты (Recovery Key, мастер-секрет) → HKDF-SHA256 (WebCrypto).
 */
export const ARGON2ID = 'argon2id' as const

export type Argon2Params = {
  id: typeof ARGON2ID
  /** Память, КиБ */
  memoryKiB: number
  iterations: number
  parallelism: number
}

/** Параметры по умолчанию v1: 64 МиБ, 3 прохода — ~0.5–1.5 с в браузере на ноутбуке */
export const PASSWORD_KDF_V1: Argon2Params = {
  id: ARGON2ID,
  memoryKiB: 64 * 1024,
  iterations: 3,
  parallelism: 1,
}

/** Минимум, ниже которого конверт не принимаем (защита от «ослабленных» параметров) */
export const PASSWORD_KDF_MIN: Omit<Argon2Params, 'id'> = {
  memoryKiB: 19 * 1024,
  iterations: 2,
  parallelism: 1,
}

export async function argon2(
  password: string,
  salt: Uint8Array,
  params: Argon2Params,
): Promise<Uint8Array> {
  return argon2id({
    password: password.normalize('NFC'),
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memoryKiB,
    hashLength: 32,
    outputType: 'binary',
  })
}

export async function hkdf(
  ikm: Uint8Array,
  info: string,
  salt: Uint8Array = new Uint8Array(0),
  length = 32,
): Promise<Uint8Array> {
  const key = await globalThis.crypto.subtle.importKey('raw', toArrayBuffer(ikm), 'HKDF', false, [
    'deriveBits',
  ])
  const bits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(utf8.encode(info)),
    },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', toArrayBuffer(data)))
}
