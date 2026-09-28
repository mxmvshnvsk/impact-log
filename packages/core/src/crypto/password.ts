import { toBase64Url } from './encoding'
import { type Argon2Params, argon2, hkdf } from './kdf'

/**
 * Пароль даёт ДВА независимых значения (ADR-0006):
 * — KEK — оборачивает Master Key, никогда не покидает клиент;
 * — authKey — отправляется серверу вместо пароля для входа.
 * Из authKey нельзя получить KEK (разные info в HKDF), поэтому сервер, проверяя вход, не может расшифровать данные.
 */
export const INFO_PASSWORD_KEK = 'impact-log/v1/password-kek'
export const INFO_PASSWORD_AUTH = 'impact-log/v1/password-auth'

export type PasswordKeys = { kek: Uint8Array; authKey: string }

export async function derivePasswordKeys(
  password: string,
  salt: Uint8Array,
  params: Argon2Params,
): Promise<PasswordKeys> {
  const master = await argon2(password, salt, params)
  const [kek, auth] = await Promise.all([
    hkdf(master, INFO_PASSWORD_KEK),
    hkdf(master, INFO_PASSWORD_AUTH),
  ])
  master.fill(0)
  return { kek, authKey: toBase64Url(auth) }
}
