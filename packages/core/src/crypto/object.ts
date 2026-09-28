import { z } from 'zod'
import { type AeadKey, generateKey, open, seal } from './aead'
import { fromBase64Url, toBase64Url, utf8 } from './encoding'

/**
 * Зашифрованный объект v1 (Impact, метаданные вложения). Каждый объект — со своим случайным DEK,
 * DEK обёрнут Master Key. Ротация MK = переобёртка DEK, без перешифровки содержимого.
 *
 * AAD привязывает шифротекст к objectId и виду объекта: сервер не может незаметно подменить один объект другим.
 */
export const OBJECT_FORMAT_VERSION = 1

const encryptedObjectSchema = z.object({
  v: z.literal(OBJECT_FORMAT_VERSION),
  alg: z.literal('A256GCM'),
  /** nonce ‖ AES-GCM_MK(DEK) */
  k: z.string(),
  /** nonce ‖ AES-GCM_DEK(payload) */
  c: z.string(),
})

export type ObjectRef = { objectId: string; kind: string }

const dekAad = (ref: ObjectRef) => utf8.encode(`impact-log/dek/v1/${ref.kind}/${ref.objectId}`)
const payloadAad = (ref: ObjectRef) =>
  utf8.encode(`impact-log/object/v1/${ref.kind}/${ref.objectId}`)

export async function encryptObject(
  mk: AeadKey,
  ref: ObjectRef,
  plaintext: Uint8Array,
): Promise<string> {
  const dek = generateKey()
  const [k, c] = await Promise.all([
    seal(mk, dek, dekAad(ref)),
    seal(dek, plaintext, payloadAad(ref)),
  ])
  dek.fill(0)
  return JSON.stringify({
    v: OBJECT_FORMAT_VERSION,
    alg: 'A256GCM',
    k: toBase64Url(k),
    c: toBase64Url(c),
  })
}

export async function decryptObject(
  mk: AeadKey,
  ref: ObjectRef,
  text: string,
): Promise<Uint8Array> {
  const parsed = encryptedObjectSchema.parse(JSON.parse(text))
  const dek = await open(mk, fromBase64Url(parsed.k), dekAad(ref))
  try {
    return await open(dek, fromBase64Url(parsed.c), payloadAad(ref))
  } finally {
    dek.fill(0)
  }
}

export async function encryptJson(mk: AeadKey, ref: ObjectRef, value: unknown): Promise<string> {
  return encryptObject(mk, ref, utf8.encode(JSON.stringify(value)))
}

export async function decryptJson(mk: AeadKey, ref: ObjectRef, text: string): Promise<unknown> {
  return JSON.parse(utf8.decode(await decryptObject(mk, ref, text)))
}

/** Ротация Master Key: DEK переоборачивается, содержимое (c) не трогаем */
export async function rewrapObject(
  oldMk: AeadKey,
  newMk: AeadKey,
  ref: ObjectRef,
  text: string,
): Promise<string> {
  const parsed = encryptedObjectSchema.parse(JSON.parse(text))
  const dek = await open(oldMk, fromBase64Url(parsed.k), dekAad(ref))
  const k = await seal(newMk, dek, dekAad(ref))
  dek.fill(0)
  return JSON.stringify({ ...parsed, k: toBase64Url(k) })
}
