import { hash, verify } from '@node-rs/argon2'

// Параметры Argon2id по рекомендации OWASP: 19 MiB, 2 итерации, 1 поток
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS)
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}

let dummyHash: Promise<string> | undefined

/**
 * Проверка «впустую» для несуществующего логина — чтобы время ответа
 * не выдавало, есть такой пользователь или нет.
 */
export async function verifyDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('impact-log-dummy-password')
  await verifyPassword(await dummyHash, password)
}
