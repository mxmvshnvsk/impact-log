import { regionResolutionSchema, regionResolveRequestSchema } from '@impact-log/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { rateLimit } from '../../lib/rateLimit'

type Options = { region: string; apiBaseUrl: string }

/** Сколько клиент может кешировать ответ */
const TTL_SECONDS = 3600

/**
 * Регион аккаунта (ADR-0011). Пока регион один — ответ одинаков для любого логина,
 * поэтому по нему нельзя узнать, существует ли аккаунт.
 */
export const regionRoutes: FastifyPluginAsyncZod<Options> = async (app, options) => {
  app.post(
    '/resolve',
    {
      config: rateLimit(60, 5),
      schema: { body: regionResolveRequestSchema, response: { 200: regionResolutionSchema } },
    },
    async () => ({
      region: options.region,
      apiBaseUrl: options.apiBaseUrl,
      ttlSeconds: TTL_SECONDS,
    }),
  )
}
