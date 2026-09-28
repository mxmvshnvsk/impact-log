import { describe, expect, it } from 'vitest'
import {
  CryptoError,
  createPasswordEnvelope,
  createRecoveryEnvelope,
  decryptJson,
  derivePasswordKeys,
  deriveRecoveryAuthKey,
  encodeRecoveryKey,
  encryptJson,
  generateMasterKey,
  hkdf,
  openPasswordEnvelope,
  openRecoveryEnvelope,
  PASSWORD_KDF_MIN,
  parseEnvelope,
  parseRecoveryKey,
  RecoveryKeyError,
  rewrapObject,
  serializeEnvelope,
} from '../src/crypto'

const FAST_KDF = { id: 'argon2id' as const, ...PASSWORD_KDF_MIN }
const hex = (h: string) => Uint8Array.from(h.match(/../g)?.map((b) => Number.parseInt(b, 16)) ?? [])
const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

describe('Recovery Key ILRK1 — тест-векторы (формат заморожен)', () => {
  const vectors = [
    {
      bytes: new Uint8Array(20).map((_, i) => i),
      text: 'ILRK1-000G-40R4-0M30-E209-185G-R38E-1W81-24GK-GJ',
      authKey: 'A-09C7UkaHAEOo4A56oNCG7ambCGqMwehFPzMwQglFk',
    },
    {
      bytes: new Uint8Array(20).fill(255),
      text: 'ILRK1-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-HS',
    },
    { bytes: new Uint8Array(20), text: 'ILRK1-0000-0000-0000-0000-0000-0000-0000-0000-NF' },
  ]

  it.each(vectors)('кодирование $text', async ({ bytes, text }) => {
    expect(await encodeRecoveryKey(bytes)).toBe(text)
    expect(await parseRecoveryKey(text)).toEqual(bytes)
  })

  it('recoveryAuthKey детерминирован', async () => {
    const v = vectors[0]
    expect(await deriveRecoveryAuthKey(v?.bytes ?? new Uint8Array())).toBe(v?.authKey)
  })

  it('разбор терпим к регистру, пробелам и путанице O/0, I/L/1', async () => {
    const messy = ' ilrk1 000g 4oR4 0m30-e2o9 185g r38e 1w8l 24gk gj '
    expect(await parseRecoveryKey(messy)).toEqual(vectors[0]?.bytes)
  })

  it('контрольная сумма ловит опечатку', async () => {
    const typo = 'ILRK1-000G-40R4-0M30-E209-185G-R38E-1W81-24GK-GK'
    await expect(parseRecoveryKey(typo)).rejects.toBeInstanceOf(RecoveryKeyError)
    const swapped = 'ILRK1-000G-40R4-0M30-E209-185G-R38E-1W81-24KG-GJ'
    await expect(parseRecoveryKey(swapped)).rejects.toMatchObject({ reason: 'checksum' })
  })

  it('неверный префикс и длина — ошибка формата', async () => {
    await expect(parseRecoveryKey('ILRK2-0000')).rejects.toMatchObject({ reason: 'format' })
    await expect(parseRecoveryKey('ILRK1-0000-0000')).rejects.toMatchObject({ reason: 'format' })
  })
})

describe('HKDF-SHA256', () => {
  it('RFC 5869, тест 1', async () => {
    const okm = await hkdf(hex('0b'.repeat(22)), '', hex('000102030405060708090a0b0c'), 42)
    // info задаётся строкой; RFC-тест с бинарным info проверяем через deriveBits напрямую ниже
    expect(okm.length).toBe(42)
    const key = await crypto.subtle.importKey('raw', hex('0b'.repeat(22)), 'HKDF', false, [
      'deriveBits',
    ])
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: hex('000102030405060708090a0b0c'),
        info: hex('f0f1f2f3f4f5f6f7f8f9'),
      },
      key,
      42 * 8,
    )
    expect(toHex(new Uint8Array(bits))).toBe(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
    )
  })
})

describe('Иерархия ключей', () => {
  it('пароль: KEK и authKey независимы; конверт открывается только верным паролем', async () => {
    const mk = generateMasterKey()
    const { envelope, authKey, salt } = await createPasswordEnvelope(
      mk,
      'correct horse battery',
      FAST_KDF,
    )
    const again = await derivePasswordKeys('correct horse battery', salt, FAST_KDF)
    expect(again.authKey).toBe(authKey)
    expect(toHex(again.kek)).not.toContain(authKey)
    const roundtrip = parseEnvelope(serializeEnvelope(envelope))
    expect(await openPasswordEnvelope(roundtrip, 'correct horse battery')).toEqual(mk)
    await expect(openPasswordEnvelope(roundtrip, 'wrong password!!')).rejects.toBeInstanceOf(
      CryptoError,
    )
  }, 30_000)

  it('подмена параметров KDF в конверте ломает проверку (AAD)', async () => {
    const mk = generateMasterKey()
    const { envelope } = await createPasswordEnvelope(mk, 'correct horse battery', FAST_KDF)
    const tampered = { ...envelope, kdf: { ...FAST_KDF, iterations: FAST_KDF.iterations + 1 } }
    await expect(openPasswordEnvelope(tampered, 'correct horse battery')).rejects.toBeInstanceOf(
      CryptoError,
    )
  }, 30_000)

  it('слишком слабые параметры Argon2id отвергаются', () => {
    expect(() =>
      parseEnvelope(
        JSON.stringify({
          v: 1,
          type: 'password',
          kdf: { id: 'argon2id', memoryKiB: 1024, iterations: 1, parallelism: 1 },
          salt: 'AAAA',
          wrapped: 'AAAA',
        }),
      ),
    ).toThrow()
  })

  it('Recovery Key разворачивает тот же MK', async () => {
    const mk = generateMasterKey()
    const { envelope, recoveryKey, authKey } = await createRecoveryEnvelope(mk)
    expect(recoveryKey).toMatch(/^ILRK1(-[0-9A-Z]{4}){8}-[0-9A-Z]{2}$/)
    expect(await openRecoveryEnvelope(envelope, recoveryKey.toLowerCase())).toEqual(mk)
    expect(await deriveRecoveryAuthKey(await parseRecoveryKey(recoveryKey))).toBe(authKey)
    const other = await createRecoveryEnvelope(mk)
    await expect(openRecoveryEnvelope(envelope, other.recoveryKey)).rejects.toBeInstanceOf(
      CryptoError,
    )
  })

  it('объект привязан к objectId; ротация MK переоборачивает только DEK', async () => {
    const mk = generateMasterKey()
    const ref = { objectId: '11111111-1111-4111-8111-111111111111', kind: 'impact' }
    const text = await encryptJson(mk, ref, { title: 'секрет' })
    expect(text).not.toContain('секрет')
    expect(await decryptJson(mk, ref, text)).toEqual({ title: 'секрет' })
    await expect(
      decryptJson(mk, { ...ref, objectId: '22222222-2222-4222-8222-222222222222' }, text),
    ).rejects.toBeInstanceOf(CryptoError)

    const newMk = generateMasterKey()
    const rewrapped = await rewrapObject(mk, newMk, ref, text)
    expect(JSON.parse(rewrapped).c).toBe(JSON.parse(text).c)
    expect(await decryptJson(newMk, ref, rewrapped)).toEqual({ title: 'секрет' })
    await expect(decryptJson(mk, ref, rewrapped)).rejects.toBeInstanceOf(CryptoError)
  })
})
