import { buildApp } from './app'
import { loadConfig } from './config'
import { createDb } from './db/client'

const config = loadConfig()
const { sql, ping } = createDb(config.DATABASE_URL)
const app = await buildApp({ config, ping })

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down')
  await app.close()
  await sql.end({ timeout: 5 })
  process.exit(0)
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))

await app.listen({ host: config.HOST, port: config.PORT })
