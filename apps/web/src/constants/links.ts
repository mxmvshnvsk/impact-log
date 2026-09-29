/**
 * Открытый исходный код: всё, что обещает страница «Принципы», можно проверить в репозитории.
 * Ссылки ведут на ветку main — ту, из которой CI собирает то, что работает на impact-log.com.
 */
export const SOURCE_URL = 'https://github.com/mxmvshnvsk/impact-log'

/** Расширение impact log в Chrome Web Store (ID элемента — из кабинета разработчика) */
export const CHROME_EXTENSION_ID = 'jlgeedpgolalalfnecjcjhoflimbfpag'
export const CHROME_WEB_STORE_URL = `https://chromewebstore.google.com/detail/${CHROME_EXTENSION_ID}`

/** Расширение impact log в VS Code Marketplace (издатель.имя) */
export const VSCODE_EXTENSION_ID = 'impact-log.impact-log-vscode'
export const VSCODE_MARKETPLACE_URL = `https://marketplace.visualstudio.com/items?itemName=${VSCODE_EXTENSION_ID}`

export interface ExtensionLink {
  key: 'chrome' | 'vscode'
  url: string
}

/**
 * Ссылки «Установить для …» (лендинг, /capture без черновика, футер). Показываем только опубликованные:
 * пока магазин проверяет расширение, его страница отвечает «не найдено».
 */
export const EXTENSION_LINKS: readonly ExtensionLink[] = [
  { key: 'chrome' as const, url: CHROME_WEB_STORE_URL, published: false },
  { key: 'vscode' as const, url: VSCODE_MARKETPLACE_URL, published: true },
]
  .filter((link) => link.published)
  .map(({ key, url }) => ({ key, url }))

/** Файл или папка репозитория на GitHub */
export function sourceUrl(path: string, kind: 'blob' | 'tree' = 'blob'): string {
  return `${SOURCE_URL}/${kind}/main/${path}`
}
