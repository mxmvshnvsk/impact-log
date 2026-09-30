import { DEFAULT_LOCALE, isLocale, type Locale } from '@impact-log/shared'

/** Язык из адреса (?lang=en) — так открываются ссылки из превью на нужном языке (src/seo/seoPlugin.ts) */
export function readUrlLocale(search: string = location.search): Locale | null {
  const value = new URLSearchParams(search).get('lang')
  return isLocale(value) ? value : null
}

/** Пользователь сам выбрал язык — ?lang из адреса убираем, чтобы после перезагрузки он не перебил выбор */
export function dropUrlLocale(): void {
  const url = new URL(location.href)
  if (!url.searchParams.has('lang')) return
  url.searchParams.delete('lang')
  history.replaceState(history.state, '', url)
}

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
