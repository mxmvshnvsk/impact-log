import { derivePasswordKeys, type PasswordKeys } from '@impact-log/core/crypto'
import type { KdfParams } from '@impact-log/shared'
import type { KdfRequest, KdfResponse } from './kdfProtocol'

/** Вывод ключей из пароля не удался (нет памяти под Argon2, WebAssembly запрещён и т.п.) */
export class KdfError extends Error {
  constructor(cause?: unknown) {
    super('KDF_FAILED', { cause })
    this.name = 'KdfError'
  }
}

/** Воркер не запустился (нет поддержки, политика браузера) — можно посчитать в основном потоке */
class WorkerStartError extends Error {}

let nextId = 1

function deriveInWorker(password: string, salt: Uint8Array, params: KdfParams) {
  return new Promise<PasswordKeys>((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./kdf.worker.ts', import.meta.url), { type: 'module' })
    } catch (error) {
      reject(new WorkerStartError(String(error)))
      return
    }
    const id = nextId++
    worker.onmessage = (event: MessageEvent<KdfResponse>) => {
      if (event.data.id !== id) return
      worker.terminate()
      if (event.data.ok) resolve({ kek: event.data.kek, authKey: event.data.authKey })
      else reject(new KdfError(event.data.error))
    }
    worker.onerror = (event) => {
      event.preventDefault()
      worker.terminate()
      reject(new WorkerStartError(event.message))
    }
    const request: KdfRequest = { id, password, salt, params }
    worker.postMessage(request)
  })
}

async function deriveInPlace(password: string, salt: Uint8Array, params: KdfParams) {
  try {
    return await derivePasswordKeys(password, salt, params)
  } catch (error) {
    throw new KdfError(error)
  }
}

/**
 * Пароль → {KEK, authKey} (Argon2id + HKDF, core/crypto). Считается в Web Worker (UI не замирает);
 * если воркер не запускается — в основном потоке (результат тот же).
 * KEK вызывающий код обнуляет сам (kek.fill(0)) сразу после использования.
 */
export async function derivePasswordKeysAsync(
  password: string,
  salt: Uint8Array,
  params: KdfParams,
): Promise<PasswordKeys> {
  if (typeof Worker === 'undefined') return deriveInPlace(password, salt, params)
  try {
    return await deriveInWorker(password, salt, params)
  } catch (error) {
    if (error instanceof WorkerStartError) {
      console.warn('[account] KDF worker unavailable, deriving on the main thread', error.message)
      return deriveInPlace(password, salt, params)
    }
    throw error
  }
}
