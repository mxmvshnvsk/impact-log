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
import { createCipher } from './lib/crypto'
import { AppError } from './lib/errors'
import { authRoutes } from './modules/auth/auth.routes'
import { createAuthService } from './modules/auth/auth.service'
import { csrfPlugin } from './plugins/csrf'
import { sessionPlugin } from './plugins/session'
import { healthRoutes } from './routes/health'
import { maskIp } from './utils/ip'

type Deps = {
  config: Config
  db: Database
  ping: () => Promise<boolean>
}

function errorBody(code: ErrorCode, details?: unknown): ApiErrorBody {
  return { error: details === undefined ? { code } : { code, details } }
}

export async function buildApp({ config, db, ping }: Deps) {
  const app = Fastify({
    trustProxy: config.TRUST_PROXY,
    logger: {
      level: config.LOG_LEVEL,
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
      serializers: {
        // Логируем только метод, путь и усечённый IP — без заголовков и полного адреса
        req(request: { method?: string; url?: string; ip?: string }) {
          return { method: request.method, url: request.url, ip: maskIp(request.ip) }
        },
      },
    },
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(helmet)
  await app.register(cookie)
  await app.register(rateLimit, { global: false })
  await app.register(csrfPlugin)
  await app.register(sessionPlugin, { db, secureCookie: config.COOKIE_SECURE })

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send(errorBody('NOT_FOUND'))
  })

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(errorBody(error.code))
    }
    if (error.validation) {
      return reply.status(400).send(errorBody('VALIDATION_ERROR', error.validation))
    }
    if (error.statusCode === 429) {
      return reply.status(429).send(errorBody('RATE_LIMITED'))
    }
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      // некорректный JSON, неподдерживаемый Content-Type и т.п.
      return reply.status(400).send(errorBody('VALIDATION_ERROR'))
    }
    request.log.error(error)
    return reply.status(500).send(errorBody('INTERNAL_ERROR'))
  })

  const auth = createAuthService({
    db,
    cipher: createCipher(config.TOTP_ENCRYPTION_KEY),
    registrationEnabled: config.REGISTRATION_ENABLED,
  })

  await app.register(healthRoutes, { prefix: '/api', ping, version: config.APP_VERSION })
  await app.register(authRoutes, { prefix: '/api/auth', auth })

  return app
}
