/**
 * Адрес web-клиента impact log. Та же логика — в chrome- и vscode-расширениях
 * (TODO: вынести в packages/core/capture).
 */
export const DEFAULT_APP_URL = 'https://impact-log.com'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Нормализует адрес: только https (http — лишь для localhost, иначе фрагмент с черновиком можно
 * перехватить), без логина, query и #, хост — только `[a-z0-9.-]` (+порт; для localhost — `[::1]`),
 * путь без хвостового «/» и спецсимволов (ссылка потом уходит внешней программе открытия браузера,
 * см. open.ts). null — адрес не годится.
 */
export function normalizeAppUrl(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  const local = LOCAL_HOSTS.has(url.hostname) || url.hostname.endsWith('.localhost')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null
  if (url.username || url.password || url.search || url.hash) return null
  // Хост — только буквы/цифры/точки/дефисы (+порт): `new URL` пропускает в hostname `&`, `"`, `(`…
  // Такой адрес не должен дойти ни до программы открытия браузера, ни до ссылки для пользователя
  if (!/^(?:[a-z0-9.-]+|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i.test(url.host)) return null
  const path = url.pathname.replace(/\/+$/, '')
  if (!/^[A-Za-z0-9._~/-]*$/.test(path)) return null
  return `${url.origin}${path}`
}
