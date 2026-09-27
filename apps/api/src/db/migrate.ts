import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { DEV_DATABASE_URL } from '../config'

// Запускается из apps/api (локально) или из /app (в контейнере) — папка drizzle лежит рядом.
const migrationsFolder = join(process.cwd(), 'drizzle')

async function main() {
  if (!existsSync(join(migrationsFolder, 'meta', '_journal.json'))) {
    console.log('[migrate] no migrations yet, skipping')
    return
  }
  // Миграциям нужна только БД — полный конфиг api (ключ 2FA и т.п.) сюда не передаётся
  const url =
    process.env.DATABASE_URL ?? (process.env.NODE_ENV === 'production' ? null : DEV_DATABASE_URL)
  if (!url) throw new Error('DATABASE_URL is required')
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await migrate(drizzle(sql), { migrationsFolder })
    console.log('[migrate] done')
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error('[migrate] failed', error)
  process.exit(1)
})
