import { and, eq, gt, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import type { Executor } from '../../db/client'
import { type DeviceRow, devices } from '../../db/schema'
import {
  deviceSecretHash,
  generateDeviceSecret,
  generateToken,
  safeEqualHex,
  sha256Hex,
} from '../../lib/crypto'

/** Сколько устройство остаётся доверенным («Запомнить этот компьютер») */
export const DEVICE_TRUST_TTL = 30 * 24 * 60 * 60 * 1000
/** last_seen_at обновляем не чаще раза в 5 минут — лишние записи в БД ни к чему */
export const LAST_SEEN_THROTTLE = 5 * 60 * 1000

/** Токен для cookie доверенного устройства; в БД уходит только его хеш */
export type DeviceTrust = { token: string; expiresAt: Date }

export function newDeviceTrust(): DeviceTrust {
  return { token: generateToken(), expiresAt: new Date(Date.now() + DEVICE_TRUST_TTL) }
}

function trustColumns(trust: DeviceTrust | null) {
  return trust
    ? { trustTokenHash: sha256Hex(trust.token), trustExpiresAt: trust.expiresAt }
    : { trustTokenHash: null, trustExpiresAt: null }
}

/**
 * Новое устройство со свежим секретом. Секрет возвращается один раз (клиенту — в sessionResponse),
 * в БД — только его SHA-256
 */
export async function createDevice(db: Executor, userId: string, trust: DeviceTrust | null) {
  const { secret, hash } = generateDeviceSecret()
  const [device] = await db
    .insert(devices)
    .values({ userId, secretHash: hash, ...trustColumns(trust) })
    .returning()
  if (!device) throw new Error('Failed to create device')
  return { device, secret }
}

export async function setDeviceTrust(db: Executor, deviceId: string, trust: DeviceTrust) {
  await db.update(devices).set(trustColumns(trust)).where(eq(devices.id, deviceId))
}

/** Устройство принадлежит пользователю и не отозвано — иначе null */
export async function findUsableDevice(
  db: Executor,
  userId: string,
  deviceId: string,
): Promise<DeviceRow | null> {
  const [device] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, userId), isNull(devices.revokedAt)))
  return device ?? null
}

/**
 * Устройство, id которого клиент предъявил вместе с секретом: этого пользователя, не отозвано,
 * секрет совпал (сравнение за постоянное время). Иначе null — вызывающий создаст новое устройство.
 */
export async function findDeviceBySecret(
  db: Executor,
  userId: string,
  deviceId: string | undefined,
  secret: string | undefined,
): Promise<DeviceRow | null> {
  if (!deviceId || !secret) return null
  const device = await findUsableDevice(db, userId, deviceId)
  if (!device?.secretHash) return null
  return safeEqualHex(deviceSecretHash(secret), device.secretHash) ? device : null
}

/** Устройство из cookie «Запомнить этот компьютер»: этого пользователя, не отозвано, доверие не истекло */
export async function findTrustedDevice(
  db: Executor,
  userId: string,
  token: string,
): Promise<DeviceRow | null> {
  const [device] = await db
    .select()
    .from(devices)
    .where(
      and(
        eq(devices.trustTokenHash, sha256Hex(token)),
        eq(devices.userId, userId),
        isNull(devices.revokedAt),
        gt(devices.trustExpiresAt, new Date()),
      ),
    )
  return device ?? null
}

/** «Выйти везде», восстановление доступа: ни одно устройство больше не входит без кода */
export async function forgetDeviceTrust(db: Executor, userId: string) {
  await db
    .update(devices)
    .set(trustColumns(null))
    .where(and(eq(devices.userId, userId), isNotNull(devices.trustTokenHash)))
}

/** Выход со стиранием данных: только это устройство перестаёт входить без кода */
export async function forgetOneDeviceTrust(db: Executor, deviceId: string) {
  await db.update(devices).set(trustColumns(null)).where(eq(devices.id, deviceId))
}

/** Отметка активности устройства (не чаще LAST_SEEN_THROTTLE) */
export async function touchDevice(db: Executor, deviceId: string, lastSeenAt: Date | null) {
  if (lastSeenAt && Date.now() - lastSeenAt.getTime() < LAST_SEEN_THROTTLE) return
  await db.update(devices).set({ lastSeenAt: sql`now()` }).where(eq(devices.id, deviceId))
}

/** Периодическая уборка: истёкшее «доверие» снимаем, чтобы хеши токенов не лежали вечно */
export async function cleanupDeviceTrust(db: Executor) {
  await db.update(devices).set(trustColumns(null)).where(lt(devices.trustExpiresAt, new Date()))
}
