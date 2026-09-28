import type { FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import type { Database } from '../db/client'
import type { SessionKind } from '../db/schema'
import { AppError } from '../lib/errors'
import {
  type ActiveSession,
  type FullSession,
  findSession,
  type NewSession,
} from '../modules/auth/sessions'
import { type DeviceTrust, touchDevice } from '../modules/devices/devices'

export const SESSION_COOKIE = 'il_session'
/** Токен доверенного устройства («Запомнить этот компьютер») */
export const DEVICE_COOKIE = 'il_device'
const DEVICE_COOKIE_PATH = '/api/auth'

declare module 'fastify' {
  interface FastifyRequest {
    /** Сессия из cookie (любого вида) или null */
    session: ActiveSession | null
  }
  interface FastifyReply {
    /** persistent=false — cookie живёт до закрытия браузера */
    setSessionCookie(session: NewSession): FastifyReply
    clearSessionCookie(): FastifyReply
    setDeviceCookie(trust: DeviceTrust): FastifyReply
    clearDeviceCookie(): FastifyReply
  }
}

type Options = { db: Database; secureCookie: boolean }

/** Читает cookie сессии в каждом запросе и даёт хелперы для установки/сброса cookie */
export const sessionPlugin = fp<Options>(async (app, { db, secureCookie }) => {
  const cookieOptions = {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'strict',
    path: '/api',
  } as const

  app.decorateRequest('session', null)

  app.decorateReply('setSessionCookie', function (this: FastifyReply, session: NewSession) {
    return this.setCookie(SESSION_COOKIE, session.token, {
      ...cookieOptions,
      ...(session.persistent ? { expires: session.expiresAt } : {}),
    })
  })

  app.decorateReply('clearSessionCookie', function (this: FastifyReply) {
    return this.clearCookie(SESSION_COOKIE, cookieOptions)
  })

  app.decorateReply('setDeviceCookie', function (this: FastifyReply, trust: DeviceTrust) {
    return this.setCookie(DEVICE_COOKIE, trust.token, {
      ...cookieOptions,
      path: DEVICE_COOKIE_PATH,
      expires: trust.expiresAt,
    })
  })

  app.decorateReply('clearDeviceCookie', function (this: FastifyReply) {
    return this.clearCookie(DEVICE_COOKIE, { ...cookieOptions, path: DEVICE_COOKIE_PATH })
  })

  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE]
    const session = token ? await findSession(db, token) : null
    request.session = session
    if (session?.kind === 'full' && session.deviceId) {
      await touchDevice(db, session.deviceId, session.deviceLastSeenAt)
    }
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

/** Полная сессия с устройством (после requireSession('full')) */
export function fullSessionOf(request: FastifyRequest): FullSession {
  const session = request.session
  if (session?.kind !== 'full' || !session.deviceId) throw new AppError('UNAUTHORIZED', 401)
  return session as FullSession
}
