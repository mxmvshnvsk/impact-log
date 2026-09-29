import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { DEV_DATABASE_URL, DEV_TOTP_KEY, SERVER_SECRET_PATTERN } from '../config'
import { deriveServerKey, LOGIN_HASH_KEY_LABEL } from '../lib/crypto'

// Запускается из apps/api (локально) или из /app (в контейнере) — папка drizzle лежит рядом.
const migrationsFolder = join(process.cwd(), 'drizzle')

/**
 * Ключ HMAC логина (hex) — миграция 0006 переводит им уже созданные аккаунты на users.login_hash.
 * Уходит параметром подключения impact_log.login_hash_key, а не SQL-запросом: в журнал запросов Postgres
 * он не попадёт. Сам TOTP_ENCRYPTION_KEY в БД не передаётся — только производный ключ.
 */
function loginHashKey(production: boolean): string | null {
  const secret = process.env.TOTP_ENCRYPTION_KEY ?? (production ? null : DEV_TOTP_KEY)
  if (!secret) return null
  if (!SERVER_SECRET_PATTERN.test(secret)) {
    throw new Error('TOTP_ENCRYPTION_KEY must be 64 hex chars (openssl rand -hex 32)')
  }
  return deriveServerKey(secret, LOGIN_HASH_KEY_LABEL).toString('hex')
}

async function main() {
  if (!existsSync(join(migrationsFolder, 'meta', '_journal.json'))) {
    console.log('[migrate] no migrations yet, skipping')
    return
  }
  // Миграциям нужны БД и серверный секрет (ключ HMAC логина для 0006), остальной конфиг api — нет
  const production = process.env.NODE_ENV === 'production'
  const url = process.env.DATABASE_URL ?? (production ? null : DEV_DATABASE_URL)
  if (!url) throw new Error('DATABASE_URL is required')
  const key = loginHashKey(production)
  const sql = postgres(url, {
    max: 1,
    onnotice: () => {},
    connection: key ? { 'impact_log.login_hash_key': key } : {},
  })
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
