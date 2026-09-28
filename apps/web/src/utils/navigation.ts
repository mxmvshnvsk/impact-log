/**
 * vue-router кладёт в history.state путь предыдущей записи истории (back). Если пользователь пришёл
 * именно оттуда, куда мы хотим вернуться, — лучше router.back(), чем плодить дубликаты в истории.
 */
export function historyBack(): string | null {
  const state = window.history.state as { back?: unknown } | null
  return typeof state?.back === 'string' ? state.back : null
}

/** Параметры query, которые можно переносить в redirect: только период (пресет и даты), без текста */
const REDIRECT_QUERY_KEYS = ['period', 'from', 'to'] as const
const SAFE_QUERY_VALUE = /^[\w-]{1,32}$/

/**
 * Адрес «вернуться сюда после входа»: путь и безопасная часть query, без фрагмента. Фрагмент может нести
 * черновик захвата (#draft=…), а query — строку поиска или заголовок быстрой записи: в redirect
 * (и дальше — в адрес /login?redirect=…) они попадать не должны.
 */
export function redirectTarget(route: { path: string; query: Record<string, unknown> }): string {
  const params = new URLSearchParams()
  for (const key of REDIRECT_QUERY_KEYS) {
    const value = route.query[key]
    if (typeof value === 'string' && SAFE_QUERY_VALUE.test(value)) params.set(key, value)
  }
  const query = params.toString()
  return query ? `${route.path}?${query}` : route.path
}
