import { and, eq, gt, lt } from 'drizzle-orm'
import type { Executor } from '../../db/client'
import { trustedDevices } from '../../db/schema'
import { generateToken, sha256Hex } from '../../lib/crypto'

/** Сколько устройство остаётся доверенным */
export const TRUSTED_DEVICE_TTL = 30 * 24 * 60 * 60 * 1000

export async function trustDevice(db: Executor, userId: string) {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_TTL)
  await db.insert(trustedDevices).values({ id: sha256Hex(token), userId, expiresAt })
  return { token, expiresAt }
}

/** Токен из cookie принадлежит этому пользователю и не истёк */
export async function isTrustedDevice(db: Executor, token: string, userId: string) {
  const [row] = await db
    .select({ id: trustedDevices.id })
    .from(trustedDevices)
    .where(
      and(
        eq(trustedDevices.id, sha256Hex(token)),
        eq(trustedDevices.userId, userId),
        gt(trustedDevices.expiresAt, new Date()),
      ),
    )
  return row !== undefined
}

export async function forgetUserDevices(db: Executor, userId: string) {
  await db.delete(trustedDevices).where(eq(trustedDevices.userId, userId))
}

export async function cleanupTrustedDevices(db: Executor) {
  await db.delete(trustedDevices).where(lt(trustedDevices.expiresAt, new Date()))
}
