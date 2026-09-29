import fp from 'fastify-plugin'
import { AppError } from '../lib/errors'

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Защита от CSRF в дополнение к SameSite=Strict cookie:
 * — POST принимается только как application/json (HTML-форма с чужого сайта не может отправить
 *   JSON без CORS-preflight). PUT/PATCH/DELETE браузер без preflight кросс-сайтово не отправит
 *   вовсе, поэтому для них Content-Type не требуем (DELETE обычно без тела);
 * — если браузер прислал Origin, он должен совпадать с нашим хостом.
 */
export const csrfPlugin = fp(async (app) => {
  app.addHook('onRequest', async (request) => {
    if (!UNSAFE_METHODS.has(request.method)) return

    if (request.method === 'POST') {
      const contentType = request.headers['content-type'] ?? ''
      if (!contentType.startsWith('application/json')) throw new AppError('FORBIDDEN', 403)
    }

    const origin = request.headers.origin
    if (origin) {
      let originHost: string
      try {
        originHost = new URL(origin).host
      } catch {
        throw new AppError('FORBIDDEN', 403)
      }
      if (originHost !== request.host) {
        // Origin и Host не секретны; подсказка для диагностики прокси (например, подмена Host)
        request.log.warn(
          { origin: originHost, host: request.host },
          'csrf: origin does not match host',
        )
        throw new AppError('FORBIDDEN', 403)
      }
    }
  })
})
