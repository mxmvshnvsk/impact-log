import type { EnvelopeType, StoredEnvelope } from '@impact-log/shared'
import { asc, eq, sql } from 'drizzle-orm'
import type { Executor } from '../../db/client'
import { keyEnvelopes } from '../../db/schema'

/** Сохраняет конверт как есть (сервер его не разбирает): вставка или замена */
export async function putEnvelope(
  db: Executor,
  userId: string,
  type: EnvelopeType,
  envelope: string,
) {
  await db
    .insert(keyEnvelopes)
    .values({ userId, type, envelope })
    .onConflictDoUpdate({
      target: [keyEnvelopes.userId, keyEnvelopes.type],
      set: { envelope, updatedAt: sql`now()` },
    })
}

export async function listEnvelopes(db: Executor, userId: string): Promise<StoredEnvelope[]> {
  const rows = await db
    .select()
    .from(keyEnvelopes)
    .where(eq(keyEnvelopes.userId, userId))
    .orderBy(asc(keyEnvelopes.type))
  return rows.map((row) => ({
    type: row.type,
    envelope: row.envelope,
    updatedAt: row.updatedAt.toISOString(),
  }))
}
