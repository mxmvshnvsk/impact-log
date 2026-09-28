import { and, eq, lt, ne, sql } from 'drizzle-orm'
import type { Executor } from '../../db/client'
import { devices, type SessionKind, sessions, type UserRow, users } from '../../db/schema'
import { generateToken, sha256Hex } from '../../lib/crypto'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** Время жизни сессии каждого вида (полная — без «Запомнить этот компьютер») */
export const SESSION_TTL: Record<SessionKind, number> = {
  enrollment: 30 * MINUTE,
  'second-factor': 5 * MINUTE,
  recovery: 15 * MINUTE,
  full: DAY,
}

/** Полная сессия с «Запомнить этот компьютер» */
export const PERSISTENT_SESSION_TTL = 30 * DAY

function ttlOf(kind: SessionKind, persistent: boolean) {
  return kind === 'full' && persistent ? PERSISTENT_SESSION_TTL : SESSION_TTL[kind]
}

/** Сколько неверных кодов можно ввести в рамках одной сессии, после — сессия удаляется */
export const MAX_CODE_ATTEMPTS = 5

export type ActiveSession = {
  id: string
  kind: SessionKind
  attempts: number
  persistent: boolean
  expiresAt: Date
  /** full — устройство сессии; second-factor — кандидат из запроса входа; иначе null */
  deviceId: string | null
  /** Когда устройство сессии последний раз было активно (null — устройства нет) */
  deviceLastSeenAt: Date | null
  /** Полная сессия после восстановления по Recovery Key: перевыпуск 2FA без текущего кода */
  viaRecovery: boolean
  user: UserRow
}

/** Полная сессия всегда привязана к устройству */
export type FullSession = ActiveSession & { kind: 'full'; deviceId: string }

export type NewSession = { token: string; expiresAt: Date; persistent: boolean }

export async function createSession(
  db: Executor,
  userId: string,
  kind: SessionKind,
  options: { persistent?: boolean; deviceId?: string | null; viaRecovery?: boolean } = {},
): Promise<NewSession> {
  const persistent = kind === 'full' && (options.persistent ?? false)
  const token = generateToken()
  const expiresAt = new Date(Date.now() + ttlOf(kind, persistent))
  await db.insert(sessions).values({
    id: sha256Hex(token),
    userId,
    kind,
    persistent,
    expiresAt,
    deviceId: options.deviceId ?? null,
    viaRecovery: kind === 'full' && (options.viaRecovery ?? false),
  })
  return { token, expiresAt, persistent }
}

/** Находит сессию по токену из cookie. Истёкшую удаляет, полную — продлевает при необходимости */
export async function findSession(db: Executor, token: string): Promise<ActiveSession | null> {
  const id = sha256Hex(token)
  const [row] = await db
    .select({
      session: sessions,
      user: users,
      device: { lastSeenAt: devices.lastSeenAt, revokedAt: devices.revokedAt },
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .leftJoin(devices, eq(sessions.deviceId, devices.id))
    .where(eq(sessions.id, id))

  if (!row) return null
  const revoked = row.session.kind === 'full' && (!row.device || row.device.revokedAt !== null)
  if (row.session.expiresAt.getTime() <= Date.now() || revoked) {
    await db.delete(sessions).where(eq(sessions.id, id))
    return null
  }

  // Полная сессия продлевается при использовании, если прошло больше половины срока
  let expiresAt = row.session.expiresAt
  const ttl = ttlOf(row.session.kind, row.session.persistent)
  if (row.session.kind === 'full' && expiresAt.getTime() - Date.now() < ttl / 2) {
    expiresAt = new Date(Date.now() + ttl)
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id))
  }

  return {
    id,
    kind: row.session.kind,
    attempts: row.session.attempts,
    persistent: row.session.persistent,
    expiresAt,
    deviceId: row.session.deviceId,
    deviceLastSeenAt: row.device?.lastSeenAt ?? null,
    viaRecovery: row.session.viaRecovery,
    user: row.user,
  }
}

export async function deleteSession(db: Executor, id: string) {
  await db.delete(sessions).where(eq(sessions.id, id))
}

export async function deleteUserSessions(db: Executor, userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId))
}

/** Все сессии пользователя, кроме текущей (смена пароля / 2FA) */
export async function deleteOtherSessions(db: Executor, userId: string, keepId: string) {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, keepId)))
}

/** Незавершённые восстановления (перевыпуск Recovery Key: старый ключ не должен дать доступ) */
export async function deleteRecoverySessions(db: Executor, userId: string) {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.kind, 'recovery')))
}

export async function deleteDeviceSessions(db: Executor, deviceId: string) {
  await db.delete(sessions).where(eq(sessions.deviceId, deviceId))
}

/** +1 неудачная попытка; возвращает, сколько попыток уже потрачено */
export async function registerFailedAttempt(db: Executor, id: string): Promise<number> {
  const [row] = await db
    .update(sessions)
    .set({ attempts: sql`${sessions.attempts} + 1` })
    .where(eq(sessions.id, id))
    .returning({ attempts: sessions.attempts })
  return row?.attempts ?? MAX_CODE_ATTEMPTS
}

/** Периодическая уборка: истёкшие сессии и брошенные незавершённые регистрации */
export async function cleanupExpired(db: Executor) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
  await db
    .delete(users)
    .where(
      and(
        eq(users.status, 'pending'),
        lt(users.createdAt, new Date(Date.now() - 2 * SESSION_TTL.enrollment)),
      ),
    )
}
