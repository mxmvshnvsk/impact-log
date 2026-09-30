/** Адрес сайта: абсолютные ссылки в превью (Open Graph) и sitemap.xml — src/seo/seoPlugin.ts */
export const SITE_URL = 'https://impact-log.com'

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

/** CLI в npm: пакет impact-log, команда impact */
export const CLI_NPM_URL = 'https://www.npmjs.com/package/impact-log'
export const CLI_INSTALL_COMMAND = 'npm install -g impact-log'

export interface CaptureClient {
  key: 'chrome' | 'vscode' | 'cli'
  url: string
  /** false — магазин ещё проверяет: страница отвечает «не найдено», ссылку не показываем */
  published: boolean
}

/** Клиенты быстрой записи — секция на лендинге */
export const CAPTURE_CLIENTS: readonly CaptureClient[] = [
  { key: 'chrome', url: CHROME_WEB_STORE_URL, published: true },
  { key: 'vscode', url: VSCODE_MARKETPLACE_URL, published: true },
  { key: 'cli', url: CLI_NPM_URL, published: true },
]

/** Ссылки «Установить …» (/capture без черновика, футер) — только опубликованные клиенты */
export const CLIENT_LINKS: readonly CaptureClient[] = CAPTURE_CLIENTS.filter(
  (client) => client.published,
)

/** Новый issue на GitHub (выбор шаблона): так тестировщики альфы сообщают о проблемах */
export const ISSUES_URL = `${SOURCE_URL}/issues/new/choose`

/** Файл или папка репозитория на GitHub */
export function sourceUrl(path: string, kind: 'blob' | 'tree' = 'blob'): string {
  return `${SOURCE_URL}/${kind}/main/${path}`
}
