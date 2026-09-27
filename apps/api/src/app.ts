import helmet from '@fastify/helmet'
import type { ApiErrorBody, ErrorCode } from '@impact-log/shared'
import Fastify, { type FastifyError } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { Config } from './config'
import { healthRoutes } from './routes/health'
import { maskIp } from './utils/ip'

type Deps = {
  config: Config
  ping: () => Promise<boolean>
}

function errorBody(code: ErrorCode, details?: unknown): ApiErrorBody {
  return { error: details === undefined ? { code } : { code, details } }
}

export async function buildApp({ config, ping }: Deps) {
  const app = Fastify({
    trustProxy: config.TRUST_PROXY,
    logger: {
      level: config.LOG_LEVEL,
      redact: ['req.headers.cookie', 'req.headers.authorization'],
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

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send(errorBody('NOT_FOUND'))
  })

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error.validation) {
      return reply.status(400).send(errorBody('VALIDATION_ERROR', error.validation))
    }
    if (error.statusCode === 429) {
      return reply.status(429).send(errorBody('RATE_LIMITED'))
    }
    request.log.error(error)
    return reply.status(500).send(errorBody('INTERNAL_ERROR'))
  })

  await app.register(healthRoutes, { prefix: '/api', ping, version: config.APP_VERSION })

  return app
}
