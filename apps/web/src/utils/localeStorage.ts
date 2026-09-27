import type { Locale } from '@impact-log/shared'

const KEY = 'impact-log:locale'

export function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function writeStoredLocale(locale: Locale): void {
  try {
    localStorage.setItem(KEY, locale)
  } catch {
    // хранилище недоступно (приватный режим) — просто не запоминаем выбор
  }
}
