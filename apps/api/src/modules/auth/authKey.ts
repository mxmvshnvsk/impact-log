import { hash, verify } from '@node-rs/argon2'
import { decodeBase64Url } from '../../lib/crypto'

/**
 * На сервер приходит не пароль, а authKey — 32 байта, уже выведенные на клиенте Argon2id+HKDF.
 * Медленный хеш всё равно нужен: утечка БД не должна давать готовый ключ для входа.
 * Параметры умеренные (OWASP-минимум: 19 MiB, 2 прохода) — основную «цену» перебора задаёт клиентский KDF.
 */
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const

/**
 * Каноническая форма ключа: байты → base64url. В последнем символе base64url есть «лишние» биты,
 * так что разные строки могут кодировать одни и те же 32 байта — хешируем именно байты.
 * (@node-rs/argon2 принимает на проверку только валидный UTF-8, поэтому не сырые байты, а строка.)
 */
function canonical(authKey: string): string {
  return decodeBase64Url(authKey).toString('base64url')
}

export function hashAuthKey(authKey: string): Promise<string> {
  return hash(canonical(authKey), OPTIONS)
}

export async function verifyAuthKey(authKeyHash: string, authKey: string): Promise<boolean> {
  try {
    return await verify(authKeyHash, canonical(authKey))
  } catch {
    return false
  }
}

let dummyHash: Promise<string> | undefined

/**
 * Проверка «впустую» для несуществующего логина — чтобы время ответа
 * не выдавало, есть такой пользователь или нет.
 */
export async function verifyDummy(authKey: string): Promise<void> {
  dummyHash ??= hash('impact-log-dummy-auth-key', OPTIONS)
  await verifyAuthKey(await dummyHash, authKey)
}
