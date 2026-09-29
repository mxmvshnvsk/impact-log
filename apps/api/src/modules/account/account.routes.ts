import {
  changePasswordRequestSchema,
  deleteAccountRequestSchema,
  okResponseSchema,
  registerStartResponseSchema,
  rotateRecoveryKeyRequestSchema,
  totpRotateConfirmRequestSchema,
  totpRotateStartRequestSchema,
} from '@impact-log/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { rateLimit } from '../../lib/rateLimit'
import { fullSessionOf, requireSession } from '../../plugins/session'
import type { AccountService } from './account.service'

type Options = { account: AccountService }

const ok = { ok: true } as const

/** Управление аккаунтом (полная сессия + повторное подтверждение authKey) */
export const accountRoutes: FastifyPluginAsyncZod<Options> = async (app, { account }) => {
  app.addHook('preHandler', requireSession('full'))

  app.post(
    '/password',
    {
      config: rateLimit(10, 15),
      schema: { body: changePasswordRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request) => {
      await account.changePassword(fullSessionOf(request), request.body)
      return ok
    },
  )

  app.post(
    '/recovery-key',
    {
      config: rateLimit(10, 15),
      schema: { body: rotateRecoveryKeyRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request) => {
      await account.rotateRecoveryKey(fullSessionOf(request), request.body)
      return ok
    },
  )

  app.post(
    '/recovery/cancel',
    { config: rateLimit(10, 15), schema: { response: { 200: okResponseSchema } } },
    async (request) => {
      await account.cancelRecovery(fullSessionOf(request))
      return ok
    },
  )

  app.post(
    '/totp/start',
    {
      config: rateLimit(10, 15),
      schema: {
        body: totpRotateStartRequestSchema,
        response: { 200: registerStartResponseSchema },
      },
    },
    async (request) => account.startTotpRotation(fullSessionOf(request), request.body),
  )

  app.post(
    '/totp/confirm',
    {
      config: rateLimit(15, 10),
      schema: { body: totpRotateConfirmRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request) => {
      await account.confirmTotpRotation(fullSessionOf(request), request.body.code)
      return ok
    },
  )

  app.post(
    '/delete',
    {
      config: rateLimit(10, 15),
      schema: { body: deleteAccountRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request, reply) => {
      await account.deleteAccount(fullSessionOf(request), request.body)
      reply.clearSessionCookie()
      reply.clearDeviceCookie()
      return ok
    },
  )
}
