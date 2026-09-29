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
 * keyEpoch — эпоха ключа хранилища (ADR-0012), ею помечается каждый push.
 */
export function createSyncApi(accountId: () => string | null, keyEpoch: () => number = () => 1) {
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
    /** Каждое изменение помечается эпохой ключа хранилища (ADR-0012): шифротекст старой эпохи → STALE_KEY */
    push: async (changes: PushChange[]) => {
      const epoch = keyEpoch()
      return post(
        '/sync/push',
        pushResponseSchema,
        { changes: changes.map((change) => ({ ...change, keyEpoch: epoch })) },
        headers(),
      )
    },
    entitlements: () => request('/entitlements', entitlementsResponseSchema),
  } satisfies SyncTransport & { entitlements: unknown }
}
