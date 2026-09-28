import { type Impact, migrateImpact, TITLE_MAX } from '@impact-log/core'
import { type AeadKey, decryptJson, encryptJson } from '@impact-log/core/crypto'
import type { ObjectKind } from '@impact-log/shared'

/*
 * Содержимое объектов для движка: расшифровка (чтобы сравнить две ветки конфликта), шифрование копии
 * («оставить обе»), сравнение и список различающихся полей. Пока вид объекта один — impact.
 */
export type ObjectRef = { objectId: string; kind: ObjectKind }

export interface SyncCodec {
  /** null — не удалось расшифровать или разобрать (чужой ключ, повреждение, неизвестная версия схемы) */
  open(ref: ObjectRef, ciphertext: string): Promise<Impact | null>
  seal(ref: ObjectRef, value: Impact): Promise<string>
}

/** key — функция, а не значение: MK может смениться (вход в аккаунт) без пересоздания движка */
export function createCodec(key: () => AeadKey): SyncCodec {
  return {
    async open(ref, ciphertext) {
      const mk = key() // ошибка «хранилище заперто» должна дойти до вызывающего, а не стать «не совпало»
      try {
        return migrateImpact(await decryptJson(mk, ref, ciphertext))
      } catch {
        return null
      }
    },
    seal(ref, value) {
      return encryptJson(key(), ref, value)
    },
  }
}

/** Поля, которые не считаются «содержимым»: время правки различается даже у одинаковых правок */
const SERVICE_FIELDS = new Set(['updatedAt', 'objectId', 'schemaVersion'])

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** Поля, различающиеся по содержимому (без служебных) */
export function diffImpacts(a: Impact, b: Impact): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const diff: string[] = []
  for (const key of keys) {
    if (SERVICE_FIELDS.has(key)) continue
    const left = (a as Record<string, unknown>)[key]
    const right = (b as Record<string, unknown>)[key]
    if (canonical(left ?? null) !== canonical(right ?? null)) diff.push(key)
  }
  return diff.sort()
}

export function sameImpact(a: Impact, b: Impact): boolean {
  return diffImpacts(a, b).length === 0
}

/** Локальная ветка конфликта как НОВАЯ запись («оставить обе»): новый objectId и пометка в заголовке */
export function copyImpact(impact: Impact, objectId: string, suffix: string, now: Date): Impact {
  const room = Math.max(1, TITLE_MAX - suffix.length)
  const base = impact.title.length > room ? impact.title.slice(0, room).trimEnd() : impact.title
  return { ...impact, objectId, title: `${base}${suffix}`, updatedAt: now.toISOString() }
}
