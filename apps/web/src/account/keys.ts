import {
  CryptoError,
  constantTimeEqual,
  createRecoveryEnvelope,
  deriveRecoveryAuthKey,
  fromBase64Url,
  type KeyEnvelope,
  openRecoveryEnvelope,
  parseEnvelope,
  parseRecoveryKey,
  randomBytes,
  serializeEnvelope,
  toBase64Url,
  unwrapMasterKey,
  wrapMasterKey,
} from '@impact-log/core/crypto'
import {
  DEFAULT_KDF_PARAMS,
  KDF_SALT_BYTES,
  type KdfParams,
  kdfParamsSchema,
  type PreloginResponse,
  type StoredEnvelope,
} from '@impact-log/shared'
import { derivePasswordKeysAsync } from './kdf'

/*
 * Ключевой материал аккаунта (ADR-0006). Всё считается на клиенте:
 * — пароль → Argon2id (воркер) → KEK (открывает password-конверт MK) + authKey (уходит на сервер);
 * — Recovery Key → HKDF → recovery-KEK + recoveryAuthKey.
 * Ни пароль, ни KEK, ни Recovery Key, ни MK на сервер не уходят.
 */

/**
 * Клиентский потолок параметров Argon2id: схема API допускает до 1 ГиБ, но вкладка не должна
 * выделять столько по указке сервера (DoS вкладки). По умолчанию — 64 МиБ / 3 прохода (DEFAULT_KDF_PARAMS).
 */
export const CLIENT_KDF_LIMITS = { memoryKiB: 256 * 1024, iterations: 8, parallelism: 4 } as const

/** Сервер прислал параметры KDF выше клиентского потолка — вывод ключей не запускаем */
export class KdfLimitError extends Error {
  constructor() {
    super('KDF_LIMIT')
    this.name = 'KdfLimitError'
  }
}

export function assertKdfWithinLimits(kdf: KdfParams): void {
  if (
    kdf.memoryKiB > CLIENT_KDF_LIMITS.memoryKiB ||
    kdf.iterations > CLIENT_KDF_LIMITS.iterations ||
    kdf.parallelism > CLIENT_KDF_LIMITS.parallelism
  ) {
    throw new KdfLimitError()
  }
}

/** Что изменилось в параметрах KDF аккаунта по сравнению с запомненными на этом устройстве (TOFU) */
export type KdfChange = { weaker: boolean; saltChanged: boolean }

/**
 * Сверка prelogin с запомненными соль/параметрами того же логина. null — сверять не с чем (первый вход
 * на устройстве, другой логин) или всё совпадает. Параметры сильнее прежних — не повод для тревоги.
 */
export function compareKdfPin(
  pin: { login: string; kdf: KdfParams; salt: string } | null | undefined,
  login: string,
  prelogin: PreloginResponse,
): KdfChange | null {
  if (!pin || pin.login !== login) return null
  const weaker =
    prelogin.kdf.memoryKiB < pin.kdf.memoryKiB || prelogin.kdf.iterations < pin.kdf.iterations
  const saltChanged = prelogin.salt !== pin.salt
  return weaker || saltChanged ? { weaker, saltChanged } : null
}

/** Пароль не открыл конверт MK (проверка на клиенте до запроса к серверу) */
export class WrongPasswordError extends Error {
  constructor() {
    super('WRONG_PASSWORD')
    this.name = 'WrongPasswordError'
  }
}

/**
 * MK аккаунта (из password-конверта) не совпадает с MK хранилища этого устройства — ротацию отсюда делать
 * нельзя (хранилище не на ключе аккаунта: нужно войти заново)
 */
export class KeyMismatchError extends Error {
  constructor() {
    super('KEY_MISMATCH')
    this.name = 'KeyMismatchError'
  }
}

export type PasswordMaterial = {
  authKey: string
  kdf: KdfParams
  /** base64url */
  salt: string
  /** Сериализованный password-конверт MK */
  passwordEnvelope: string
}

export type RecoveryMaterial = {
  /** ILRK1-… — показывается пользователю один раз, нигде не сохраняется */
  recoveryKey: string
  recoveryEnvelope: string
  recoveryAuthKey: string
}

/** Новый пароль для MK: свежая соль, параметры KDF по умолчанию, конверт MK под новым KEK */
export async function createPasswordMaterial(
  password: string,
  masterKey: Uint8Array,
): Promise<PasswordMaterial> {
  const salt = randomBytes(KDF_SALT_BYTES)
  const kdf = DEFAULT_KDF_PARAMS
  const { kek, authKey } = await derivePasswordKeysAsync(password, salt, kdf)
  try {
    const envelope = await wrapMasterKey(masterKey, kek, { type: 'password', kdf, salt })
    return { authKey, kdf, salt: toBase64Url(salt), passwordEnvelope: serializeEnvelope(envelope) }
  } finally {
    kek.fill(0)
  }
}

/** Новый Recovery Key и recovery-конверт того же MK */
export async function createRecoveryMaterial(masterKey: Uint8Array): Promise<RecoveryMaterial> {
  const { envelope, recoveryKey, authKey } = await createRecoveryEnvelope(masterKey)
  return { recoveryKey, recoveryEnvelope: serializeEnvelope(envelope), recoveryAuthKey: authKey }
}

/**
 * Ключи для входа по соли/параметрам из prelogin. Нижнюю границу проверила схема (не ниже минимума),
 * верхнюю — клиентский потолок (иначе KdfLimitError, до запуска Argon2id).
 */
export function deriveLoginKeys(password: string, prelogin: PreloginResponse) {
  assertKdfWithinLimits(prelogin.kdf)
  return derivePasswordKeysAsync(password, fromBase64Url(prelogin.salt), prelogin.kdf)
}

function readEnvelope(text: string, type: KeyEnvelope['type']): KeyEnvelope {
  let envelope: KeyEnvelope
  try {
    envelope = parseEnvelope(text)
  } catch {
    throw new CryptoError('malformed envelope')
  }
  if (envelope.type !== type) throw new CryptoError('unexpected envelope type')
  return envelope
}

/** Конверт нужного типа из GET /api/keys */
export function pickEnvelope(envelopes: readonly StoredEnvelope[], type: 'password' | 'recovery') {
  const found = envelopes.find((item) => item.type === type)
  if (!found) throw new CryptoError(`${type} envelope missing`)
  return found.envelope
}

/** Открывает password-конверт уже выведенным KEK → MK (32 байта). Неверный ключ — CryptoError */
export function openPasswordEnvelopeWithKek(text: string, kek: Uint8Array): Promise<Uint8Array> {
  return unwrapMasterKey(readEnvelope(text, 'password'), kek)
}

/**
 * Проверка текущего пароля по password-конверту (для повторного подтверждения действий):
 * выводим ключи с параметрами конверта, открываем его → authKey для сервера и MK.
 * Параметры KDF из конверта ограничиваем теми же рамками, что и prelogin, и клиентским потолком
 * (защита от DoS памяти).
 */
export async function unlockWithPassword(
  envelopeText: string,
  password: string,
): Promise<{ authKey: string; masterKey: Uint8Array }> {
  const envelope = readEnvelope(envelopeText, 'password')
  const kdf = kdfParamsSchema.safeParse(envelope.kdf)
  if (!kdf.success) throw new CryptoError('unsupported kdf')
  assertKdfWithinLimits(kdf.data)
  const { kek, authKey } = await derivePasswordKeysAsync(
    password,
    fromBase64Url(envelope.salt),
    kdf.data,
  )
  try {
    return { authKey, masterKey: await unwrapMasterKey(envelope, kek) }
  } catch (error) {
    if (error instanceof CryptoError) throw new WrongPasswordError()
    throw error
  } finally {
    kek.fill(0)
  }
}

/**
 * Ротация MK (ADR-0012): password-конверт НОВОГО MK тем же паролем — тем же KEK (соль и параметры KDF
 * берутся из текущего конверта), поэтому authKey не меняется и пароль остаётся прежним. Одним выводом
 * ключей заодно проверяется пароль (текущий конверт должен открыться) и возвращается MK текущей эпохи —
 * вызывающий сверяет его с MK хранилища и обнуляет.
 */
export async function rewrapPasswordEnvelope(
  envelopeText: string,
  password: string,
  nextMasterKey: Uint8Array,
): Promise<{ authKey: string; currentMasterKey: Uint8Array; passwordEnvelope: string }> {
  const envelope = readEnvelope(envelopeText, 'password')
  const kdf = kdfParamsSchema.safeParse(envelope.kdf)
  if (!kdf.success) throw new CryptoError('unsupported kdf')
  assertKdfWithinLimits(kdf.data)
  const salt = fromBase64Url(envelope.salt)
  const { kek, authKey } = await derivePasswordKeysAsync(password, salt, kdf.data)
  try {
    let currentMasterKey: Uint8Array
    try {
      currentMasterKey = await unwrapMasterKey(envelope, kek)
    } catch (error) {
      if (error instanceof CryptoError) throw new WrongPasswordError()
      throw error
    }
    const next = await wrapMasterKey(nextMasterKey, kek, { type: 'password', kdf: kdf.data, salt })
    return { authKey, currentMasterKey, passwordEnvelope: serializeEnvelope(next) }
  } finally {
    kek.fill(0)
  }
}

/** Recovery Key → recoveryAuthKey. Ошибки формата/контрольной суммы — RecoveryKeyError */
export async function recoveryAuthKeyFrom(recoveryKey: string): Promise<string> {
  const secret = await parseRecoveryKey(recoveryKey)
  try {
    return await deriveRecoveryAuthKey(secret)
  } finally {
    secret.fill(0)
  }
}

/** Открывает recovery-конверт Recovery Key'ем → MK */
export function openRecoveryEnvelopeText(text: string, recoveryKey: string): Promise<Uint8Array> {
  return openRecoveryEnvelope(readEnvelope(text, 'recovery'), recoveryKey)
}

export function sameKey(a: Uint8Array, b: Uint8Array): boolean {
  return constantTimeEqual(a, b)
}
