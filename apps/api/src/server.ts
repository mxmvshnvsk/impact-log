import { buildApp } from './app'
import { loadConfig } from './config'
import { createDb } from './db/client'
import { cleanupDelayedRecovery } from './modules/auth/delayedRecovery'
import { cleanupExpired } from './modules/auth/sessions'
import { cleanupDeviceTrust } from './modules/devices/devices'

const HOUR = 60 * 60 * 1000

const config = loadConfig()
const { sql, db, ping } = createDb(config.DATABASE_URL)
const app = await buildApp({ config, db, ping })

// Уборка истёкших сессий, брошенных регистраций, истёкшего «доверия» устройств
// и истёкших отложенных восстановлений
const cleanup = setInterval(() => {
  Promise.all([cleanupExpired(db), cleanupDeviceTrust(db), cleanupDelayedRecovery(db)]).catch(
    (error) => app.log.error(error, 'cleanup failed'),
  )
}, HOUR)

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutting down')
  clearInterval(cleanup)
  await app.close()
  await sql.end({ timeout: 5 })
  process.exit(0)
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))

await app.listen({ host: config.HOST, port: config.PORT })
