import { keysResponseSchema } from '@impact-log/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Database } from '../../db/client'
import { fullSessionOf, requireSession } from '../../plugins/session'
import { listEnvelopes } from './envelopes'

type Options = { db: Database }

/** Ключевые конверты: клиент открывает password-конверт KEK'ом из пароля и получает Master Key */
export const keysRoutes: FastifyPluginAsyncZod<Options> = async (app, { db }) => {
  app.get(
    '/',
    { preHandler: requireSession('full'), schema: { response: { 200: keysResponseSchema } } },
    async (request) => ({ envelopes: await listEnvelopes(db, fullSessionOf(request).user.id) }),
  )
}
