import {
  pullQuerySchema,
  pullResponseSchema,
  pushRequestSchema,
  pushResponseSchema,
  SYNC_ACCOUNT_HEADER,
} from '@impact-log/shared'
import type { FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { AppError } from '../../lib/errors'
import { fullSessionOf, requireSession } from '../../plugins/session'
import type { SyncService } from './sync.service'

type Options = {
  sync: SyncService
  /** Запросов /api/sync/* в минуту на пользователя (env SYNC_RATE_LIMIT_MAX) */
  rateLimitMax: number
}

/** Максимальный размер тела push (MAX_PUSH_CHANGES × MAX_OBJECT_CIPHERTEXT больше — режем здесь) */
const PUSH_BODY_LIMIT = 8 * 1024 * 1024
const MINUTE = 60_000
const ACCOUNT_HEADER = SYNC_ACCOUNT_HEADER.toLowerCase()

/**
 * Клиент подтверждает, для какого аккаунта синхронизирует хранилище: заголовок X-Impact-Account
 * с публичным accountId. Не совпал с пользователем сессии (в браузере вошли в другой аккаунт) →
 * 409 ACCOUNT_MISMATCH, и данные двух аккаунтов не смешаются. Нет заголовка → 400.
 */
async function requireAccountHeader(request: FastifyRequest) {
  const header = request.headers[ACCOUNT_HEADER]
  if (typeof header !== 'string' || header.trim() === '') {
    throw new AppError('VALIDATION_ERROR', 400)
  }
  if (header.trim() !== fullSessionOf(request).user.accountId) {
    throw new AppError('ACCOUNT_MISMATCH', 409)
  }
}

export const syncRoutes: FastifyPluginAsyncZod<Options> = async (app, { sync, rateLimitMax }) => {
  // Проверки — в onRequest (сессия к этому моменту уже прочитана плагином session): до разбора тела,
  // так что сверх лимита или с чужим аккаунтом push в 8 МиБ даже не парсится
  app.addHook('onRequest', requireSession('full'))
  // Лимит частоты на пользователя, а не на IP: рост хранилища ограничиваем по аккаунту
  app.addHook(
    'onRequest',
    app.rateLimit({
      max: rateLimitMax,
      timeWindow: MINUTE,
      keyGenerator: (request) => `user:${fullSessionOf(request).user.id}`,
    }),
  )
  app.addHook('onRequest', requireAccountHeader)

  app.get(
    '/pull',
    { schema: { querystring: pullQuerySchema, response: { 200: pullResponseSchema } } },
    async (request) => {
      const { cursor, limit } = request.query
      return sync.pull(fullSessionOf(request).user.id, cursor, limit)
    },
  )

  app.post(
    '/push',
    {
      bodyLimit: PUSH_BODY_LIMIT,
      schema: { body: pushRequestSchema, response: { 200: pushResponseSchema } },
    },
    async (request) => ({
      results: await sync.push(fullSessionOf(request).user.id, request.body.changes),
    }),
  )
}
