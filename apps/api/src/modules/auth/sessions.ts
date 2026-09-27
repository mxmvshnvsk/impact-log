import { and, eq, lt, sql } from 'drizzle-orm'
import type { Executor } from '../../db/client'
import { type SessionKind, sessions, type UserRow, users } from '../../db/schema'
import { generateToken, sha256Hex } from '../../lib/crypto'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** Время жизни сессии каждого вида */
export const SESSION_TTL: Record<SessionKind, number> = {
  enrollment: 30 * MINUTE,
  'second-factor': 5 * MINUTE,
  full: 30 * DAY,
}

/** Полная сессия продлевается, если до конца осталось меньше половины срока */
const RENEW_THRESHOLD = SESSION_TTL.full / 2

/** Сколько неверных кодов можно ввести в рамках одной сессии, после — сессия удаляется */
export const MAX_CODE_ATTEMPTS = 5

export type ActiveSession = {
  id: string
  kind: SessionKind
  attempts: number
  expiresAt: Date
  user: UserRow
}

export async function createSession(db: Executor, userId: string, kind: SessionKind) {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL[kind])
  await db.insert(sessions).values({ id: sha256Hex(token), userId, kind, expiresAt })
  return { token, expiresAt }
}

/** Находит сессию по токену из cookie. Истёкшую удаляет, полную — продлевает при необходимости */
export async function findSession(db: Executor, token: string): Promise<ActiveSession | null> {
  const id = sha256Hex(token)
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))

  if (!row) return null
  if (row.session.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id))
    return null
  }

  let expiresAt = row.session.expiresAt
  if (row.session.kind === 'full' && expiresAt.getTime() - Date.now() < RENEW_THRESHOLD) {
    expiresAt = new Date(Date.now() + SESSION_TTL.full)
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id))
  }

  return {
    id,
    kind: row.session.kind,
    attempts: row.session.attempts,
    expiresAt,
    user: row.user,
  }
}

export async function deleteSession(db: Executor, id: string) {
  await db.delete(sessions).where(eq(sessions.id, id))
}

export async function deleteUserSessions(db: Executor, userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId))
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
