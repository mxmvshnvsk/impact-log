import { healthResponseSchema } from '@impact-log/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

type Options = {
  ping: () => Promise<boolean>
  version: string
}

export const healthRoutes: FastifyPluginAsyncZod<Options> = async (app, { ping, version }) => {
  app.get('/health', { schema: { response: { 200: healthResponseSchema } } }, async () => {
    const dbOk = await ping()
    return {
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk ? 'ok' : 'error',
      version,
    } as const
  })
}
