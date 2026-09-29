import {
  codeRequestSchema,
  loginRecoveryKeyRequestSchema,
  loginRequestSchema,
  loginResponseSchema,
  loginTotpResetRequestSchema,
  logoutRequestSchema,
  meResponseSchema,
  okResponseSchema,
  preloginRequestSchema,
  preloginResponseSchema,
  recoveryBeginRequestSchema,
  recoveryBeginResponseSchema,
  recoveryCompleteRequestSchema,
  recoveryDelayResponseSchema,
  recoveryUnlockResponseSchema,
  recoveryVerifyRequestSchema,
  registerRequestSchema,
  sessionResponseSchema,
  totpSecretResponseSchema,
} from '@impact-log/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { UserRow } from '../../db/schema'
import { perLoginRateLimit, rateLimit } from '../../lib/rateLimit'
import { DEVICE_COOKIE, fullSessionOf, requireSession, sessionOf } from '../../plugins/session'
import type { AuthService } from './auth.service'
import { recoveryPendingOf } from './delayedRecovery'
import { toUserDto } from './user'

type Options = { auth: AuthService }

/** sessionResponseSchema: deviceSecret — только если устройство создано этим запросом */
function sessionBody(result: { user: UserRow; deviceId: string; deviceSecret?: string }) {
  return {
    user: toUserDto(result.user),
    deviceId: result.deviceId,
    deviceSecret: result.deviceSecret,
  }
}

export const authRoutes: FastifyPluginAsyncZod<Options> = async (app, { auth }) => {
  // Лимиты по логину (сверх лимитов по IP): перебор одного аккаунта с множества адресов
  const loginPerLogin = perLoginRateLimit(app, 10, 15)

  app.post(
    '/prelogin',
    {
      config: rateLimit(30, 5),
      schema: { body: preloginRequestSchema, response: { 200: preloginResponseSchema } },
    },
    async (request) => auth.prelogin(request.body.login),
  )

  app.post(
    '/register',
    {
      config: rateLimit(5, 60),
      schema: { body: registerRequestSchema, response: { 200: totpSecretResponseSchema } },
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
      config: rateLimit(15, 10),
      preHandler: requireSession('enrollment'),
      schema: { body: codeRequestSchema, response: { 200: sessionResponseSchema } },
    },
    async (request, reply) => {
      const result = await auth.confirmRegistration(sessionOf(request), request.body)
      reply.setSessionCookie(result.session)
      if (result.trust) reply.setDeviceCookie(result.trust)
      return sessionBody(result)
    },
  )

  app.post(
    '/login',
    {
      config: rateLimit(10, 5),
      preHandler: loginPerLogin,
      schema: { body: loginRequestSchema, response: { 200: loginResponseSchema } },
    },
    async (request, reply) => {
      const result = await auth.login(request.body, request.cookies[DEVICE_COOKIE])
      reply.setSessionCookie(result.session)
      return result.next === 'done'
        ? { next: 'done' as const, user: toUserDto(result.user), deviceId: result.deviceId }
        : { next: 'second-factor' as const }
    },
  )

  app.post(
    '/login/verify',
    {
      config: rateLimit(15, 5),
      preHandler: requireSession('second-factor'),
      schema: { body: codeRequestSchema, response: { 200: sessionResponseSchema } },
    },
    async (request, reply) => {
      const result = await auth.verifySecondFactor(sessionOf(request), request.body)
      reply.setSessionCookie(result.session)
      if (result.trust) reply.setDeviceCookie(result.trust)
      return sessionBody(result)
    },
  )

  // B. Потерян телефон: пароль (уже проверен в /login) + Recovery Key вместо кода → новая 2FA
  app.post(
    '/login/recovery-key',
    {
      config: rateLimit(10, 15),
      preHandler: requireSession('second-factor'),
      schema: {
        body: loginRecoveryKeyRequestSchema,
        response: { 200: totpSecretResponseSchema },
      },
    },
    async (request) => auth.loginWithRecoveryKey(sessionOf(request), request.body.recoveryAuthKey),
  )

  app.post(
    '/login/totp-reset',
    {
      config: rateLimit(15, 5),
      preHandler: requireSession('totp-reset'),
      schema: { body: loginTotpResetRequestSchema, response: { 200: sessionResponseSchema } },
    },
    async (request, reply) => {
      const result = await auth.confirmTotpReset(sessionOf(request), request.body)
      reply.setSessionCookie(result.session)
      if (result.trust) reply.setDeviceCookie(result.trust)
      return sessionBody(result)
    },
  )

  // Восстановление по Recovery Key: begin → verify (A) | delay … resume (C) → complete
  app.post(
    '/recovery/begin',
    {
      config: rateLimit(5, 15),
      schema: { body: recoveryBeginRequestSchema, response: { 200: recoveryBeginResponseSchema } },
    },
    async (request, reply) => {
      const { session, delayed } = await auth.beginRecovery(request.body)
      reply.setSessionCookie(session)
      return { delayed }
    },
  )

  app.post(
    '/recovery/verify',
    {
      config: rateLimit(15, 10),
      preHandler: requireSession('recovery'),
      schema: {
        body: recoveryVerifyRequestSchema,
        response: { 200: recoveryUnlockResponseSchema },
      },
    },
    async (request) => auth.verifyRecovery(sessionOf(request), request.body.code),
  )

  app.post(
    '/recovery/delay',
    {
      config: rateLimit(10, 15),
      preHandler: requireSession('recovery'),
      schema: { response: { 200: recoveryDelayResponseSchema } },
    },
    async (request) => auth.delayRecovery(sessionOf(request)),
  )

  app.post(
    '/recovery/resume',
    {
      config: rateLimit(10, 15),
      preHandler: requireSession('recovery'),
      schema: { response: { 200: recoveryUnlockResponseSchema } },
    },
    async (request) => auth.resumeRecovery(sessionOf(request)),
  )

  app.post(
    '/recovery/complete',
    {
      config: rateLimit(10, 15),
      preHandler: requireSession('recovery'),
      schema: { body: recoveryCompleteRequestSchema, response: { 200: sessionResponseSchema } },
    },
    async (request, reply) => {
      const result = await auth.completeRecovery(sessionOf(request), request.body)
      reply.setSessionCookie(result.session)
      return sessionBody(result)
    },
  )

  app.post(
    '/logout',
    {
      preHandler: requireSession('full'),
      schema: { body: logoutRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request, reply) => {
      const everywhere = request.body?.everywhere ?? false
      const forgetDevice = request.body?.forgetDevice ?? false
      await auth.logout(sessionOf(request), { everywhere, forgetDevice })
      reply.clearSessionCookie()
      if (everywhere || forgetDevice) reply.clearDeviceCookie()
      return { ok: true } as const
    },
  )

  app.get(
    '/me',
    { preHandler: requireSession('full'), schema: { response: { 200: meResponseSchema } } },
    async (request) => {
      const session = fullSessionOf(request)
      return {
        user: toUserDto(session.user),
        deviceId: session.deviceId,
        recoveryPending: recoveryPendingOf(session.user.recoveryAvailableAt),
      }
    },
  )
}
