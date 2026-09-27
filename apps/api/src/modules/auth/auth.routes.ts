import {
  codeRequestSchema,
  credentialsSchema,
  loginRequestSchema,
  loginResponseSchema,
  meResponseSchema,
  okResponseSchema,
  registerConfirmResponseSchema,
  registerStartResponseSchema,
  secondFactorRequestSchema,
} from '@impact-log/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { DEVICE_COOKIE, requireSession, sessionOf } from '../../plugins/session'
import { type AuthService, toUserDto } from './auth.service'

type Options = { auth: AuthService }

const MINUTE = 60_000

/** Лимиты частоты по IP для чувствительных эндпоинтов */
const limit = (max: number, minutes: number) => ({
  rateLimit: { max, timeWindow: minutes * MINUTE },
})

export const authRoutes: FastifyPluginAsyncZod<Options> = async (app, { auth }) => {
  app.post(
    '/register',
    {
      config: limit(5, 60),
      schema: { body: credentialsSchema, response: { 200: registerStartResponseSchema } },
    },
    async (request, reply) => {
      const { session, enrollment } = await auth.startRegistration(request.body, request.session)
      reply.setSessionCookie(session)
      return enrollment
    },
  )

  app.post(
    '/register/confirm',
    {
      config: limit(15, 10),
      preHandler: requireSession('enrollment'),
      schema: { body: codeRequestSchema, response: { 200: registerConfirmResponseSchema } },
    },
    async (request, reply) => {
      const result = await auth.confirmRegistration(sessionOf(request), request.body.code)
      reply.setSessionCookie(result.session)
      return { user: toUserDto(result.user), recoveryCodes: result.recoveryCodes }
    },
  )

  app.post(
    '/login',
    {
      config: limit(10, 5),
      schema: { body: loginRequestSchema, response: { 200: loginResponseSchema } },
    },
    async (request, reply) => {
      const result = await auth.login(request.body, request.cookies[DEVICE_COOKIE])
      reply.setSessionCookie(result.session)
      return result.next === 'done'
        ? { next: 'done' as const, user: toUserDto(result.user) }
        : { next: 'second-factor' as const }
    },
  )

  app.post(
    '/login/verify',
    {
      config: limit(15, 5),
      preHandler: requireSession('second-factor'),
      schema: { body: secondFactorRequestSchema, response: { 200: meResponseSchema } },
    },
    async (request, reply) => {
      const { user, session, device } = await auth.verifySecondFactor(
        sessionOf(request),
        request.body,
      )
      reply.setSessionCookie(session)
      if (device) reply.setDeviceCookie(device)
      return { user: toUserDto(user) }
    },
  )

  app.post(
    '/logout',
    {
      preHandler: requireSession('full'),
      schema: {
        body: z.object({ everywhere: z.boolean().optional() }).optional(),
        response: { 200: okResponseSchema },
      },
    },
    async (request, reply) => {
      await auth.logout(sessionOf(request), request.body?.everywhere ?? false)
      reply.clearSessionCookie()
      return { ok: true } as const
    },
  )

  app.get(
    '/me',
    { preHandler: requireSession('full'), schema: { response: { 200: meResponseSchema } } },
    async (request) => ({ user: toUserDto(sessionOf(request).user) }),
  )
}
