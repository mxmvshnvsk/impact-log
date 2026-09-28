import { z } from 'zod'

/**
 * Регион-агностичные контракты (ADR-0005 §11.3, ADR-0011). В пилоте один регион, но:
 * — Account ID не кодирует регион;
 * — клиенты не хардкодят API: они резолвят endpoint и умеют пере-резолвить его по ответу WRONG_REGION.
 */
export const regionResolutionSchema = z.object({
  /** Идентификатор региона (конфигурация развёртывания, не доменная константа) */
  region: z.string().min(1),
  /** Базовый URL API региона: абсолютный или относительный к origin приложения */
  apiBaseUrl: z.string().min(1),
  /** Сколько секунд можно кешировать */
  ttlSeconds: z.number().int().positive(),
})
export type RegionResolution = z.infer<typeof regionResolutionSchema>

type CachedResolution = RegionResolution & { resolvedAt: number }

/**
 * Кеш резолвинга: клиент хранит endpoint, пока не истёк ttl или сервер не ответил WRONG_REGION.
 */
export function createEndpointResolver(resolve: () => Promise<RegionResolution>) {
  let cached: CachedResolution | null = null

  async function get(now = Date.now()): Promise<RegionResolution> {
    if (cached && now - cached.resolvedAt < cached.ttlSeconds * 1000) return cached
    const fresh = regionResolutionSchema.parse(await resolve())
    cached = { ...fresh, resolvedAt: now }
    return fresh
  }

  function invalidate() {
    cached = null
  }

  return { get, invalidate }
}

/* ---------- Account ID ---------- */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Показ непрозрачного Account ID группами: 7F82-KL92-PA71 */
export function formatAccountId(raw: string): string {
  return (
    raw
      .replace(/[^0-9A-Za-z]/g, '')
      .toUpperCase()
      .match(/.{1,4}/g)
      ?.join('-') ?? raw
  )
}

/** 60 случайных бит → 12 символов Crockford Base32. Регион не кодируется */
export function generateAccountId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(12))
  let id = ''
  for (const byte of bytes) id += CROCKFORD[byte % 32]
  return id
}

export function normalizeAccountId(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}
