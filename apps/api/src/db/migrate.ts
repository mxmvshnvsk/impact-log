import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { loadConfig } from '../config'

// Запускается из apps/api (локально) или из /app (в контейнере) — папка drizzle лежит рядом.
const migrationsFolder = join(process.cwd(), 'drizzle')

async function main() {
  if (!existsSync(join(migrationsFolder, 'meta', '_journal.json'))) {
    console.log('[migrate] no migrations yet, skipping')
    return
  }
  const { DATABASE_URL } = loadConfig()
  const sql = postgres(DATABASE_URL, { max: 1 })
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
