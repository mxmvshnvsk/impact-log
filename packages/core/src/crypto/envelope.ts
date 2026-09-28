import { z } from 'zod'
import { type AeadKey, open, seal } from './aead'
import { fromBase64Url, toBase64Url, utf8 } from './encoding'
import { CryptoError } from './errors'
import { ARGON2ID, type Argon2Params, PASSWORD_KDF_MIN } from './kdf'

/**
 * Ключевой конверт (Key Envelope) v1 — обёрнутый Master Key + всё, что нужно, чтобы его развернуть,
 * кроме самого секрета. Параметры KDF хранятся в конверте и версионируются (можно усилить позже).
 *
 * AAD связывает шифротекст с типом конверта, версией, KDF и солью — подмена полей ломает проверку.
 */
export const ENVELOPE_VERSION = 1
export const ENVELOPE_KINDS = ['password', 'recovery', 'device'] as const
export type EnvelopeKind = (typeof ENVELOPE_KINDS)[number]

const kdfSchema = z.discriminatedUnion('id', [
  z.object({
    id: z.literal(ARGON2ID),
    memoryKiB: z
      .number()
      .int()
      .min(PASSWORD_KDF_MIN.memoryKiB)
      .max(4 * 1024 * 1024),
    iterations: z.number().int().min(PASSWORD_KDF_MIN.iterations).max(64),
    parallelism: z.number().int().min(1).max(16),
  }),
  z.object({ id: z.literal('hkdf-sha256') }),
  /** Ключ устройства — неэкспортируемый CryptoKey в хранилище браузера, KDF не нужен */
  z.object({ id: z.literal('none') }),
])
export type EnvelopeKdf = z.infer<typeof kdfSchema>

export const keyEnvelopeSchema = z.object({
  v: z.literal(ENVELOPE_VERSION),
  type: z.enum(ENVELOPE_KINDS),
  kdf: kdfSchema,
  /** Соль KDF (base64url); у device — пустая строка */
  salt: z.string(),
  /** nonce ‖ AES-256-GCM(MK) */
  wrapped: z.string().min(1),
})
export type KeyEnvelope = z.infer<typeof keyEnvelopeSchema>

function envelopeAad(type: EnvelopeKind, kdf: EnvelopeKdf, salt: string): Uint8Array {
  const kdfPart =
    kdf.id === ARGON2ID ? `${kdf.id}:${kdf.memoryKiB}:${kdf.iterations}:${kdf.parallelism}` : kdf.id
  return utf8.encode(`impact-log/envelope/v${ENVELOPE_VERSION}/${type}/${kdfPart}/${salt}`)
}

export async function wrapMasterKey(
  masterKey: Uint8Array,
  kek: AeadKey,
  meta: { type: EnvelopeKind; kdf: EnvelopeKdf | Argon2Params; salt: Uint8Array },
): Promise<KeyEnvelope> {
  const kdf = kdfSchema.parse(meta.kdf)
  const salt = toBase64Url(meta.salt)
  const wrapped = await seal(kek, masterKey, envelopeAad(meta.type, kdf, salt))
  return { v: ENVELOPE_VERSION, type: meta.type, kdf, salt, wrapped: toBase64Url(wrapped) }
}

export async function unwrapMasterKey(envelope: KeyEnvelope, kek: AeadKey): Promise<Uint8Array> {
  const parsed = keyEnvelopeSchema.parse(envelope)
  const mk = await open(
    kek,
    fromBase64Url(parsed.wrapped),
    envelopeAad(parsed.type, parsed.kdf, parsed.salt),
  )
  if (mk.length !== 32) throw new CryptoError()
  return mk
}

export function serializeEnvelope(envelope: KeyEnvelope): string {
  return JSON.stringify(keyEnvelopeSchema.parse(envelope))
}

export function parseEnvelope(text: string): KeyEnvelope {
  return keyEnvelopeSchema.parse(JSON.parse(text))
}

export function envelopeSalt(envelope: KeyEnvelope): Uint8Array {
  return fromBase64Url(envelope.salt)
}
