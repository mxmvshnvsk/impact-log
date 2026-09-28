import { generateKey } from './aead'
import { randomBytes } from './encoding'
import { envelopeSalt, type KeyEnvelope, unwrapMasterKey, wrapMasterKey } from './envelope'
import { type Argon2Params, PASSWORD_KDF_V1 } from './kdf'
import { derivePasswordKeys } from './password'
import {
  deriveRecoveryAuthKey,
  deriveRecoveryKek,
  generateRecoveryKey,
  parseRecoveryKey,
} from './recovery'

/**
 * Иерархия ключей (ADR-0005 §9, ADR-0006):
 *
 *   Password ─Argon2id→ master ─HKDF→ KEK ─┐
 *   Recovery Key ─HKDF→ Recovery KEK ──────┼─ wraps → Master Key (случайный, не из пароля)
 *   Device key (неэкспортируемый) ─────────┘              └─ wraps → DEK объекта → содержимое
 */
export const SALT_BYTES = 16

export function generateMasterKey(): Uint8Array {
  return generateKey()
}

export async function createPasswordEnvelope(
  masterKey: Uint8Array,
  password: string,
  params: Argon2Params = PASSWORD_KDF_V1,
): Promise<{ envelope: KeyEnvelope; authKey: string; salt: Uint8Array }> {
  const salt = randomBytes(SALT_BYTES)
  const { kek, authKey } = await derivePasswordKeys(password, salt, params)
  const envelope = await wrapMasterKey(masterKey, kek, { type: 'password', kdf: params, salt })
  kek.fill(0)
  return { envelope, authKey, salt }
}

export async function openPasswordEnvelope(
  envelope: KeyEnvelope,
  password: string,
): Promise<Uint8Array> {
  if (envelope.kdf.id !== 'argon2id') throw new Error('not a password envelope')
  const { kek } = await derivePasswordKeys(password, envelopeSalt(envelope), envelope.kdf)
  try {
    return await unwrapMasterKey(envelope, kek)
  } finally {
    kek.fill(0)
  }
}

export async function createRecoveryEnvelope(masterKey: Uint8Array) {
  const { secret, text } = await generateRecoveryKey()
  const salt = randomBytes(SALT_BYTES)
  const kek = await deriveRecoveryKek(secret, salt)
  const envelope = await wrapMasterKey(masterKey, kek, {
    type: 'recovery',
    kdf: { id: 'hkdf-sha256' },
    salt,
  })
  const authKey = await deriveRecoveryAuthKey(secret)
  kek.fill(0)
  secret.fill(0)
  return { envelope, recoveryKey: text, authKey }
}

/** Разворачивает MK Recovery Key'ем. Ошибка формата/контрольной суммы — RecoveryKeyError, неверный ключ — CryptoError */
export async function openRecoveryEnvelope(
  envelope: KeyEnvelope,
  recoveryKey: string,
): Promise<Uint8Array> {
  const secret = await parseRecoveryKey(recoveryKey)
  const kek = await deriveRecoveryKek(secret, envelopeSalt(envelope))
  try {
    return await unwrapMasterKey(envelope, kek)
  } finally {
    kek.fill(0)
    secret.fill(0)
  }
}
