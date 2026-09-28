import { entitlementsResponseSchema, resolveEntitlements } from '@impact-log/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Database } from '../../db/client'
import { fullSessionOf, requireSession } from '../../plugins/session'
import { countActiveImpacts, countDevices, storageUsage } from './usage'

type Options = { db: Database }

/** Тариф → профиль возможностей (ADR-0009) и текущее использование квот */
export const entitlementsRoutes: FastifyPluginAsyncZod<Options> = async (app, { db }) => {
  app.get(
    '/',
    {
      preHandler: requireSession('full'),
      schema: { response: { 200: entitlementsResponseSchema } },
    },
    async (request) => {
      const { user } = fullSessionOf(request)
      const [activeImpacts, deviceCount, storage] = await Promise.all([
        countActiveImpacts(db, user.id),
        countDevices(db, user.id),
        storageUsage(db, user.id),
      ])
      return {
        plan: user.plan,
        profile: resolveEntitlements({ planId: user.plan }),
        usage: { activeImpacts, devices: deviceCount, ...storage },
      }
    },
  )
}
