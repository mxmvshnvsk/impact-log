import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export function createDb(url: string) {
  const sql = postgres(url, { max: 10, connect_timeout: 5 })
  const db = drizzle(sql, { schema })

  async function ping(): Promise<boolean> {
    try {
      await sql`select 1`
      return true
    } catch {
      return false
    }
  }

  return { sql, db, ping }
}

export type Db = ReturnType<typeof createDb>
