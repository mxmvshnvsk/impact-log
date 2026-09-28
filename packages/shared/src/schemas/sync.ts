import { z } from 'zod'

/**
 * Протокол синхронизации (ADR-0007). Сервер хранит только непрозрачные зашифрованные объекты,
 * их версии и tombstone'ы. Оптимистичная конкурентность на уровне объекта: objectId + baseVersion.
 *
 * GET  /api/sync/pull?cursor=<seq>&limit=<n>  → pullResponseSchema
 * POST /api/sync/push  pushRequestSchema      → pushResponseSchema
 *
 * Каждый запрос /api/sync/* несёт заголовок SYNC_ACCOUNT_HEADER с accountId аккаунта, к которому
 * привязано локальное хранилище: не совпал с пользователем сессии → 409 ACCOUNT_MISMATCH (клиент не
 * смешает данные двух аккаунтов), нет заголовка → 400 VALIDATION_ERROR.
 */
export const SYNC_ACCOUNT_HEADER = 'X-Impact-Account'
export const OBJECT_KINDS = ['impact'] as const
export type ObjectKind = (typeof OBJECT_KINDS)[number]

/** Верхняя граница размера одного зашифрованного объекта (не вложения) */
export const MAX_OBJECT_CIPHERTEXT = 256 * 1024
export const MAX_PUSH_CHANGES = 200
export const PULL_LIMIT_DEFAULT = 500
export const PULL_LIMIT_MAX = 1000
/** Страница pull ограничена ещё и суммой шифротекстов (но в ней всегда есть хотя бы один объект) */
export const PULL_MAX_BYTES = 8 * 1024 * 1024

export const pushChangeSchema = z.object({
  objectId: z.uuid(),
  kind: z.enum(OBJECT_KINDS),
  /** Версия, от которой клиент делал изменение; 0 — новый объект */
  baseVersion: z.number().int().nonnegative(),
  /**
   * null — удаление (tombstone). Удалить можно только существующий объект: tombstone для объекта,
   * которого на сервере нет, отклоняется (rejected INVALID)
   */
  ciphertext: z.string().min(1).max(MAX_OBJECT_CIPHERTEXT).nullable(),
})
export type PushChange = z.infer<typeof pushChangeSchema>

export const pushRequestSchema = z.object({
  changes: z.array(pushChangeSchema).min(1).max(MAX_PUSH_CHANGES),
})
export type PushRequest = z.infer<typeof pushRequestSchema>

export const serverObjectSchema = z.object({
  objectId: z.uuid(),
  kind: z.enum(OBJECT_KINDS),
  version: z.number().int().positive(),
  ciphertext: z.string().nullable(),
  deleted: z.boolean(),
  /** Порядковый номер изменения (монотонный) — курсор для pull */
  seq: z.number().int().positive(),
})
export type ServerObject = z.infer<typeof serverObjectSchema>

/**
 * QUOTA_EXCEEDED — квота тарифа: активные impact (maxActiveImpacts), байты шифротекста
 * (maxStorageBytes) или число живых объектов (maxObjects); ограничивается только рост.
 * INVALID — baseVersion > 0 или tombstone у несуществующего объекта, смена kind.
 */
export const PUSH_REJECT_CODES = ['QUOTA_EXCEEDED', 'INVALID'] as const

export const pushResultSchema = z.discriminatedUnion('status', [
  z.object({
    objectId: z.uuid(),
    status: z.literal('accepted'),
    version: z.number().int().positive(),
    seq: z.number().int().positive(),
  }),
  z.object({
    objectId: z.uuid(),
    status: z.literal('conflict'),
    /** Текущая серверная ветка — клиент расшифрует обе и разрешит конфликт, ничего не теряя */
    server: serverObjectSchema,
  }),
  z.object({
    objectId: z.uuid(),
    status: z.literal('rejected'),
    code: z.enum(PUSH_REJECT_CODES),
  }),
])
export type PushResult = z.infer<typeof pushResultSchema>

export const pushResponseSchema = z.object({ results: z.array(pushResultSchema) })
export type PushResponse = z.infer<typeof pushResponseSchema>

export const pullQuerySchema = z.object({
  cursor: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().max(PULL_LIMIT_MAX).default(PULL_LIMIT_DEFAULT),
})

export const pullResponseSchema = z.object({
  changes: z.array(serverObjectSchema),
  /** Максимальный seq в ответе (или прежний курсор, если изменений нет) */
  cursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
})
export type PullResponse = z.infer<typeof pullResponseSchema>
