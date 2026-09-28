import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { AppError } from './errors'

const MINUTE = 60_000

/**
 * Лимит частоты по IP для чувствительного эндпоинта (config маршрута для @fastify/rate-limit).
 * Ключ — utils/ip.ts → rateLimitKey (IPv6 — по /64), задан в app.ts для всего плагина.
 */
export function rateLimit(max: number, minutes: number) {
  return { rateLimit: { max, timeWindow: minutes * MINUTE } }
}

/**
 * Дополнительный лимит по логину из тела (preHandler — тело уже разобрано и логин нормализован zod).
 * Считаются все запросы с этим логином с любых IP: перебор по одному аккаунту не размазать по адресам.
 * У каждого вызова свой счётчик (свой store), так что маршруты друг другу не мешают.
 * В логи ключ (логин) не попадает: плагин ничего не пишет.
 */
export function perLoginRateLimit(
  app: Pick<FastifyInstance, 'createRateLimit'>,
  max: number,
  minutes: number,
) {
  const limiter = app.createRateLimit({
    max,
    timeWindow: minutes * MINUTE,
    keyGenerator: (request: FastifyRequest) =>
      `login:${String((request.body as { login?: unknown } | undefined)?.login)}`,
    // Запас LRU: поток «чужих» логинов не должен быстро вытеснять счётчики настоящих
    cache: 20_000,
  } as Parameters<FastifyInstance['createRateLimit']>[0])

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await limiter(request)
    if (result.isAllowed || !result.isExceeded) return
    reply.header('retry-after', result.ttlInSeconds)
    throw new AppError('RATE_LIMITED', 429)
  }
}
