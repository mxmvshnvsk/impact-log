import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import type { ApiErrorBody, ErrorCode } from '@impact-log/shared'
import Fastify, { type FastifyError } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { Config } from './config'
import type { Database } from './db/client'
import { createLoginHasher, createTotpCipher, deriveServerKey } from './lib/crypto'
import { AppError } from './lib/errors'
import { sanitizeLogArgs, serializeError } from './lib/logging'
import { accountRoutes } from './modules/account/account.routes'
import { createAccountService } from './modules/account/account.service'
import { authRoutes } from './modules/auth/auth.routes'
import { createAuthService } from './modules/auth/auth.service'
import { devicesRoutes } from './modules/devices/devices.routes'
import { entitlementsRoutes } from './modules/entitlements/entitlements.routes'
import { keysRoutes } from './modules/keys/keys.routes'
import { createRotationService } from './modules/keys/rotation.service'
import { regionRoutes } from './modules/region/region.routes'
import { syncRoutes } from './modules/sync/sync.routes'
import { createSyncService } from './modules/sync/sync.service'
import { csrfPlugin } from './plugins/csrf'
import { sessionPlugin } from './plugins/session'
import { healthRoutes } from './routes/health'
import { maskIp, rateLimitKey } from './utils/ip'

type Deps = {
  config: Config
  db: Database
  ping: () => Promise<boolean>
}

/**
 * Метка подключа для «фальшивой» соли prelogin (из TOTP_ENCRYPTION_KEY). Ключ шифрования TOTP-секретов
 * выводится из того же секрета с другой меткой (lib/crypto.ts → TOTP_SECRET_KEY_LABEL) — ключи независимы.
 */
const PRELOGIN_KEY_LABEL = 'impact-log/prelogin-salt/v1'

function errorBody(code: ErrorCode, details?: unknown): ApiErrorBody {
  return { error: details === undefined ? { code } : { code, details } }
}

/** Есть ли в разобранном JSON строка (или ключ) с символом NUL — Postgres не хранит его в text */
function containsNul(value: unknown): boolean {
  if (typeof value === 'string') return value.includes('\u0000')
  if (Array.isArray(value)) return value.some(containsNul)
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, item]) => key.includes('\u0000') || containsNul(item))
  }
  return false
}

export async function buildApp({ config, db, ping }: Deps) {
  const app = Fastify({
    trustProxy: config.TRUST_PROXY,
    logger: {
      level: config.LOG_LEVEL,
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
      serializers: {
        // Логируем только метод, путь и усечённый IP — без заголовков, тела и полного адреса
        req(request: { method?: string; url?: string; ip?: string }) {
          return { method: request.method, url: request.url, ip: maskIp(request.ip) }
        },
        // Ошибки БД — без текста запроса и параметров (lib/logging.ts)
        err: serializeError,
      },
      hooks: {
        // …и без err.message в msg, который pino подставляет, если сообщение не передано
        logMethod(args, method) {
          return method.apply(this, sanitizeLogArgs(args) as Parameters<typeof method>)
        },
      },
    },
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // JSON как обычно (с защитой от __proto__), но пустое тело — пустой объект, а не ошибка:
  // клиенты шлют DELETE/logout с Content-Type: application/json и без тела.
  // (undefined не подходит: перед валидацией Fastify превращает его в null.)
  const parseJson = app.getDefaultJsonParser('error', 'error')
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    if (body === '') {
      done(null, {})
      return
    }
    parseJson(request, body as string, (error, value) => {
      if (error) return done(error)
      // NUL не хранится в Postgres text: без этой проверки такой запрос дошёл бы до БД и дал 500
      if (containsNul(value)) {
        return done(Object.assign(new Error('NUL character in JSON'), { statusCode: 400 }))
      }
      done(null, value)
    })
  })

  await app.register(helmet)
  await app.register(cookie)
  // Ключ лимитов по IP: IPv6 — по префиксу /64 (utils/ip.ts). Лимиты по логину и пользователю —
  // отдельные счётчики
  // (lib/rateLimit.ts → perLoginRateLimit, modules/sync/sync.routes.ts, modules/keys/keys.routes.ts)
  await app.register(rateLimit, {
    global: false,
    keyGenerator: (request) => rateLimitKey(request.ip),
  })
  await app.register(csrfPlugin)
  await app.register(sessionPlugin, { db, secureCookie: config.COOKIE_SECURE })

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send(errorBody('NOT_FOUND'))
  })

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(errorBody(error.code, error.details))
    }
    if (error.validation) {
      return reply.status(400).send(errorBody('VALIDATION_ERROR', error.validation))
    }
    if (error.statusCode === 429) {
      return reply.status(429).send(errorBody('RATE_LIMITED'))
    }
    if (error.statusCode === 413) {
      return reply.status(413).send(errorBody('PAYLOAD_TOO_LARGE'))
    }
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      // некорректный JSON, неподдерживаемый Content-Type и т.п.
      return reply.status(400).send(errorBody('VALIDATION_ERROR'))
    }
    request.log.error(error, 'request failed')
    return reply.status(500).send(errorBody('INTERNAL_ERROR'))
  })

  const cipher = createTotpCipher(config.TOTP_ENCRYPTION_KEY)
  const auth = createAuthService({
    db,
    cipher,
    preloginKey: deriveServerKey(config.TOTP_ENCRYPTION_KEY, PRELOGIN_KEY_LABEL),
    hashLogin: createLoginHasher(config.TOTP_ENCRYPTION_KEY),
    registrationEnabled: config.REGISTRATION_ENABLED,
  })
  const account = createAccountService({ db, cipher })
  const sync = createSyncService({ db })
  const rotation = createRotationService({ db })

  await app.register(healthRoutes, { prefix: '/api', ping, version: config.APP_VERSION })
  await app.register(authRoutes, { prefix: '/api/auth', auth })
  await app.register(keysRoutes, {
    prefix: '/api/keys',
    rotation,
    rateLimitMax: config.SYNC_RATE_LIMIT_MAX,
  })
  await app.register(accountRoutes, { prefix: '/api/account', account })
  await app.register(devicesRoutes, { prefix: '/api/devices', db })
  await app.register(entitlementsRoutes, { prefix: '/api/entitlements', db })
  await app.register(syncRoutes, {
    prefix: '/api/sync',
    sync,
    rateLimitMax: config.SYNC_RATE_LIMIT_MAX,
  })
  await app.register(regionRoutes, {
    prefix: '/api/region',
    region: config.REGION,
    apiBaseUrl: config.PUBLIC_API_BASE_URL,
  })

  return app
}
