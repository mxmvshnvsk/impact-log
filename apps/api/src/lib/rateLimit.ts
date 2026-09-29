import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { rateLimitKey } from '../utils/ip'
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
 * Дополнительный лимит по паре «логин + IP (IPv6 — /64)» (preHandler — тело уже разобрано zod).
 * Ключ намеренно включает адрес: глобальный счётчик по одному логину позволил бы любому, кто знает логин,
 * заблокировать вход владельцу. Распределённый перебор пароля упирается в Argon2id на стороне атакующего
 * и в обязательную 2FA с блокировкой на пользователя (totpGuard). В логи ключ не попадает.
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
      `login:${String((request.body as { login?: unknown } | undefined)?.login)}|${rateLimitKey(request.ip)}`,
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
