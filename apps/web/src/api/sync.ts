import {
  entitlementsResponseSchema,
  type PushChange,
  pullResponseSchema,
  pushResponseSchema,
} from '@impact-log/shared'
import type { SyncTransport } from '@/sync/types'
import { ApiError, post, request } from './http'

/** Заголовок сверки аккаунта: сервер отвечает 409 ACCOUNT_MISMATCH, если сессия — другого аккаунта */
export const ACCOUNT_HEADER = 'X-Impact-Account'

/**
 * Синхронизация зашифрованных объектов (ADR-0007): сервер видит только шифротексты и версии.
 * Каждый запрос /api/sync/* несёт публичный Account ID хранилища (vault.account.accountId): если cookie
 * сессии принадлежит другому аккаунту (вошли в другой аккаунт в соседней вкладке), сервер откажет,
 * и объекты одного аккаунта не уйдут в другой. Без привязанного аккаунта запрос не отправляется.
 */
export function createSyncApi(accountId: () => string | null) {
  function headers(): Record<string, string> {
    const id = accountId()
    if (!id) throw new ApiError(409, 'ACCOUNT_MISMATCH')
    return { [ACCOUNT_HEADER]: id }
  }
  return {
    pull: async (cursor: number, limit: number) =>
      request(`/sync/pull?cursor=${cursor}&limit=${limit}`, pullResponseSchema, {
        headers: headers(),
      }),
    push: async (changes: PushChange[]) =>
      post('/sync/push', pushResponseSchema, { changes }, headers()),
    entitlements: () => request('/entitlements', entitlementsResponseSchema),
  } satisfies SyncTransport & { entitlements: unknown }
}
