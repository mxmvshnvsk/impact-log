/// <reference lib="webworker" />
import { derivePasswordKeys } from '@impact-log/core/crypto'
import type { KdfRequest, KdfResponse } from './kdfProtocol'

/*
 * Argon2id (64 МиБ, ~1 с) в отдельном потоке: UI не замирает. Воркер живёт одну операцию —
 * после ответа его завершают, и память Argon2 (64 МиБ WebAssembly) освобождается вместе с ним.
 * Пароль в воркере ни во что не сохраняется.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = async (event: MessageEvent<KdfRequest>) => {
  const { id, password, salt, params } = event.data
  try {
    const { kek, authKey } = await derivePasswordKeys(password, salt, params)
    const response: KdfResponse = { id, ok: true, kek, authKey }
    // KEK передаём без копирования (Transferable): в воркере буфер становится пустым
    scope.postMessage(response, [kek.buffer])
  } catch (error) {
    const response: KdfResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    scope.postMessage(response)
  }
}
