import { randomInt } from 'node:crypto'
import { RECOVERY_CODES_COUNT } from '@impact-log/shared'

// Без похожих символов (0/o, 1/l/i) — коды будут переписывать руками
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const LENGTH = 12

function generateCode(): string {
  let code = ''
  for (let i = 0; i < LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  return code
}

/** Код в нормализованном виде (как хранится хеш) */
export function generateRecoveryCodes(count: number = RECOVERY_CODES_COUNT): string[] {
  return Array.from({ length: count }, generateCode)
}

/** Для показа пользователю: xxxx-xxxx-xxxx */
export function formatRecoveryCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code
}
