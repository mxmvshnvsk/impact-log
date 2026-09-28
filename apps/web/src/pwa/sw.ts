/// <reference lib="webworker" />
import type { PwaHasFileReply, PwaRequest } from './protocol'

/*
 * Service worker impact log — офлайн-оболочка приложения (docs/pwa.md).
 *
 * Собирается отдельно от приложения (src/pwa/swBuildPlugin.ts): esbuild без бандлинга, поэтому здесь
 * нет импортов кроме типов. Список файлов сборки и хеш версии подставляются на этапе build.
 *
 * Что кешируется: ТОЛЬКО файлы сборки приложения (index.html, js/css, воркеры, шрифты, иконки) — список
 * известен заранее. Ответы API, записи, ключи и любые пользовательские данные сюда не попадают:
 * запросы к /api/* и чужим источникам service worker не перехватывает вовсе.
 *
 *   навигация (переход по адресу) → сеть с таймаутом → закешированный index.html (SPA);
 *   файл из списка сборки          → кеш, при промахе — сеть (и дозапись в кеш);
 *   всё остальное                  → мимо service worker.
 */

declare const __PWA_VERSION__: string
declare const __PWA_PRECACHE__: string[]

const sw = self as unknown as ServiceWorkerGlobalScope

/** Совпадает с SHELL_CACHE_PREFIX из ./protocol (здесь нельзя импортировать значения) */
const CACHE_PREFIX = 'impact-log-shell-'
const VERSION = __PWA_VERSION__
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`
const PRECACHE = new Set(__PWA_PRECACHE__)
const SHELL = '/index.html'
/** Сколько ждать сеть при переходе, прежде чем открыть оболочку из кеша */
const NAVIGATION_TIMEOUT_MS = 3000

sw.addEventListener('install', (event) => {
  // Новая версия скачивается целиком в фоне; ждать активации она будет, пока пользователь не обновит
  // страницу по кнопке (или пока не закроются все вкладки)
  event.waitUntil(precache())
})

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      )
      // Предзагрузка навигации: запрос страницы уходит в сеть параллельно с запуском service worker
      await sw.registration.navigationPreload?.enable().catch(() => undefined)
      // Первая установка: берём под контроль уже открытую вкладку — ленивые экраны будут из кеша
      await sw.clients.claim()
    })(),
  )
})

sw.addEventListener('message', (event) => {
  const message = event.data as PwaRequest | null
  if (message?.type === 'pwa:skip-waiting') {
    event.waitUntil(sw.skipWaiting())
  } else if (message?.type === 'pwa:has-file') {
    const reply: PwaHasFileReply = { version: VERSION, has: PRECACHE.has(message.path) }
    event.ports[0]?.postMessage(reply)
  }
})

sw.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // Чужие источники и API — мимо service worker: ни перехвата, ни кеша
  if (url.origin !== sw.location.origin || isApi(url.pathname)) return

  if (request.mode === 'navigate') {
    event.respondWith(navigate(event))
  } else if (PRECACHE.has(url.pathname)) {
    event.respondWith(fromShell(request, url.pathname))
  }
})

function isApi(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/')
}

/** Скачивает все файлы версии. Файлы с хешем в имени берутся из кеша прошлой версии, если есть */
async function precache(): Promise<void> {
  const cache = await caches.open(CACHE_NAME)
  await Promise.all(
    [...PRECACHE].map(async (path) => {
      if (await cache.match(path)) return
      const hashed = path.startsWith('/assets/')
      const previous = hashed ? await caches.match(path) : undefined
      if (previous) {
        await cache.put(path, previous)
        return
      }
      // Без хеша (index.html, иконки, манифест) — мимо HTTP-кеша браузера, чтобы не взять старый файл
      const response = await fetch(path, { cache: hashed ? 'default' : 'no-cache' })
      if (!response.ok) throw new Error(`precache ${path}: HTTP ${response.status}`)
      await cache.put(path, await withoutRedirect(response))
    }),
  )
}

/** Ответ после редиректа нельзя отдавать на навигацию — копируем тело в «чистый» ответ */
async function withoutRedirect(response: Response): Promise<Response> {
  if (!response.redirected) return response
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

async function navigate(event: FetchEvent): Promise<Response> {
  try {
    const response = await withTimeout(fromNetwork(event), NAVIGATION_TIMEOUT_MS)
    // Сервер отвечает, но с ошибкой (прокси, перезапуск) — лучше рабочая оболочка из кеша
    if (response.status < 500) return response
    return (await shell()) ?? response
  } catch {
    return (await shell()) ?? Response.error()
  }
}

async function fromNetwork(event: FetchEvent): Promise<Response> {
  const preloaded = (await event.preloadResponse) as Response | undefined
  return preloaded ?? fetch(event.request)
}

async function shell(): Promise<Response | undefined> {
  const cache = await caches.open(CACHE_NAME)
  return cache.match(SHELL)
}

async function fromShell(request: Request, path: string): Promise<Response> {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(path)
  if (cached) return cached
  // Кеш почистил браузер или установка не завершилась — берём из сети и восстанавливаем
  const response = await fetch(request)
  if (response.ok && response.type === 'basic') await cache.put(path, response.clone())
  return response
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
