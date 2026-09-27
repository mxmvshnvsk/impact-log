import fp from 'fastify-plugin'
import { AppError } from '../lib/errors'

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Защита от CSRF в дополнение к SameSite=Strict cookie:
 * — изменяющие запросы принимаются только как application/json
 *   (HTML-форма с чужого сайта не может отправить JSON без CORS-preflight);
 * — если браузер прислал Origin, он должен совпадать с нашим хостом.
 */
export const csrfPlugin = fp(async (app) => {
  app.addHook('onRequest', async (request) => {
    if (!UNSAFE_METHODS.has(request.method)) return

    const contentType = request.headers['content-type'] ?? ''
    if (!contentType.startsWith('application/json')) throw new AppError('FORBIDDEN', 403)

    const origin = request.headers.origin
    if (origin) {
      let originHost: string
      try {
        originHost = new URL(origin).host
      } catch {
        throw new AppError('FORBIDDEN', 403)
      }
      if (originHost !== request.host) throw new AppError('FORBIDDEN', 403)
    }
  })
})
