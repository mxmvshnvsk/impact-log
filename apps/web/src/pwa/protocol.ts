/*
 * Сообщения между страницей и service worker (src/pwa/sw.ts). Файл только с типами и константами:
 * service worker импортирует отсюда лишь типы (`import type`) — сборка sw.ts не бандлит зависимости.
 */

/** Префикс имён кешей оболочки: `impact-log-shell-<версия сборки>`. Других кешей приложение не заводит */
export const SHELL_CACHE_PREFIX = 'impact-log-shell-'

/** Путь service worker (scope — весь сайт) */
export const SERVICE_WORKER_URL = '/sw.js'

/** Страница → service worker */
export type PwaRequest =
  /** Активировать ожидающую версию (пользователь нажал «Обновить») */
  | { type: 'pwa:skip-waiting' }
  /** Есть ли файл в оболочке этой версии; ответ — в `event.ports[0]` */
  | { type: 'pwa:has-file'; path: string }

/** Ответ service worker на `pwa:has-file` */
export interface PwaHasFileReply {
  version: string
  has: boolean
}
