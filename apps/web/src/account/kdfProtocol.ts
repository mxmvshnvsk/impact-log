import type { KdfParams } from '@impact-log/shared'

/** Сообщения между основным потоком и воркером KDF */
export type KdfRequest = {
  id: number
  password: string
  salt: Uint8Array
  params: KdfParams
}

export type KdfResponse =
  | { id: number; ok: true; kek: Uint8Array; authKey: string }
  | { id: number; ok: false; error: string }
