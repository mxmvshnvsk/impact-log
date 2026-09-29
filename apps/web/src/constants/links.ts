/**
 * Открытый исходный код: всё, что обещает страница «Принципы», можно проверить в репозитории.
 * Ссылки ведут на ветку main — ту, из которой CI собирает то, что работает на impact-log.com.
 */
export const SOURCE_URL = 'https://github.com/mxmvshnvsk/impact-log'

/** Расширение impact log в Chrome Web Store (ID элемента — из кабинета разработчика) */
export const CHROME_EXTENSION_ID = 'jlgeedpgolalalfnecjcjhoflimbfpag'
export const CHROME_WEB_STORE_URL = `https://chromewebstore.google.com/detail/${CHROME_EXTENSION_ID}`

/** Файл или папка репозитория на GitHub */
export function sourceUrl(path: string, kind: 'blob' | 'tree' = 'blob'): string {
  return `${SOURCE_URL}/${kind}/main/${path}`
}
