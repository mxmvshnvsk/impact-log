import { KDF_SALT_BYTES } from '@impact-log/shared'
import { hmacSha256 } from '../../lib/crypto'

/**
 * «Фальшивая» соль для несуществующих и незавершённых логинов: первые 16 байт
 * HMAC-SHA256(ключ, 'prelogin:' + login). Детерминирована (повторный запрос даёт то же самое)
 * и неотличима по форме от настоящей — prelogin не раскрывает, существует ли аккаунт.
 */
export function fakeSalt(key: Uint8Array, login: string): string {
  return hmacSha256(key, `prelogin:${login}`).subarray(0, KDF_SALT_BYTES).toString('base64url')
}
