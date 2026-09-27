import type { FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import type { Database } from '../db/client'
import type { SessionKind } from '../db/schema'
import { AppError } from '../lib/errors'
import { type ActiveSession, findSession } from '../modules/auth/sessions'

export const SESSION_COOKIE = 'il_session'
/** Токен доверенного устройства («Запомнить этот компьютер») */
export const DEVICE_COOKIE = 'il_device'

declare module 'fastify' {
  interface FastifyRequest {
    /** Сессия из cookie (любого вида) или null */
    session: ActiveSession | null
  }
  interface FastifyReply {
    /** persistent=false — cookie живёт до закрытия браузера */
    setSessionCookie(session: SessionCookie): FastifyReply
    clearSessionCookie(): FastifyReply
    setDeviceCookie(device: { token: string; expiresAt: Date }): FastifyReply
  }
}

type Options = { db: Database; secureCookie: boolean }
type SessionCookie = { token: string; expiresAt: Date; persistent: boolean }

/** Читает cookie сессии в каждом запросе и даёт хелперы для установки/сброса cookie */
export const sessionPlugin = fp<Options>(async (app, { db, secureCookie }) => {
  const cookieOptions = {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'strict',
    path: '/api',
  } as const

  app.decorateRequest('session', null)

  app.decorateReply('setSessionCookie', function (this: FastifyReply, session: SessionCookie) {
    return this.setCookie(SESSION_COOKIE, session.token, {
      ...cookieOptions,
      ...(session.persistent ? { expires: session.expiresAt } : {}),
    })
  })

  app.decorateReply(
    'setDeviceCookie',
    function (this: FastifyReply, device: { token: string; expiresAt: Date }) {
      return this.setCookie(DEVICE_COOKIE, device.token, {
        ...cookieOptions,
        path: '/api/auth',
        expires: device.expiresAt,
      })
    },
  )

  app.decorateReply('clearSessionCookie', function (this: FastifyReply) {
    return this.clearCookie(SESSION_COOKIE, cookieOptions)
  })

  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE]
    request.session = token ? await findSession(db, token) : null
  })
})

/** preHandler: пускает только с сессией нужного вида */
export function requireSession(kind: SessionKind) {
  return async (request: FastifyRequest) => {
    if (!request.session) {
      throw new AppError(kind === 'full' ? 'UNAUTHORIZED' : 'SESSION_EXPIRED', 401)
    }
    if (request.session.kind !== kind) throw new AppError('UNAUTHORIZED', 401)
  }
}

/** Сессия гарантированно есть (после requireSession) */
export function sessionOf(request: FastifyRequest): ActiveSession {
  if (!request.session) throw new AppError('UNAUTHORIZED', 401)
  return request.session
}
