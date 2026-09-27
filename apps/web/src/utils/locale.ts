import { DEFAULT_LOCALE, isLocale, type Locale } from '@impact-log/shared'

/**
 * Выбирает язык интерфейса: сохранённый пользователем → первый подходящий язык браузера → по умолчанию.
 */
export function resolveLocale(saved: string | null, browserLanguages: readonly string[]): Locale {
  if (isLocale(saved)) return saved
  for (const language of browserLanguages) {
    const base = language.toLowerCase().split('-')[0]
    if (isLocale(base)) return base
  }
  return DEFAULT_LOCALE
}
