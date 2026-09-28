import { readonly, ref } from 'vue'
import { type PwaHasFileReply, type PwaRequest, SERVICE_WORKER_URL } from './protocol'

/*
 * Регистрация service worker и обновления приложения (docs/pwa.md). Синглтон модуля.
 *
 * Новая версия ставится в фоне. Страницу без спроса не перезагружаем (пользователь может заполнять
 * форму): показываем тост PwaUpdateToast, по кнопке активируем ожидающую версию и перезагружаем.
 * Если вкладка уже работает на новой версии (переход прошёл по сети после деплоя), ожидающий
 * service worker активируется тихо — перезагружать нечего.
 */

/** Как часто проверять sw.js, пока вкладка открыта (переходы внутри SPA проверку не запускают) */
const UPDATE_INTERVAL_MS = 60 * 60 * 1000
/** Проверка при возвращении на вкладку — не чаще */
const UPDATE_THROTTLE_MS = 15 * 60 * 1000
const REPLY_TIMEOUT_MS = 3000
const RELOAD_FALLBACK_MS = 3000

const available = ref(false)
const applying = ref(false)
let registration: ServiceWorkerRegistration | null = null
/** Смена контроллера, которую ждём сами: 'reload' — по кнопке «Обновить»; 'silent' — тихая активация */
let expected: 'reload' | 'silent' | null = null
let reloading = false
let fallbackTimer: ReturnType<typeof setTimeout> | undefined
let lastCheck = 0

/** Регистрирует service worker: только production-сборка и только если браузер умеет */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const start = () => {
    setup(navigator.serviceWorker).catch(() => {
      // Нет service worker (приватный режим, политика браузера) — приложение работает как обычный сайт
    })
  }
  // После загрузки страницы: скачивание оболочки не конкурирует с первым рендером
  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
}

async function setup(container: ServiceWorkerContainer): Promise<void> {
  let controlled = container.controller !== null
  container.addEventListener('controllerchange', () => {
    if (expected === 'reload') {
      expected = null
      clearTimeout(fallbackTimer)
      reload()
      return
    }
    const wasControlled = controlled
    controlled = true
    if (expected === 'silent') {
      expected = null
      return
    }
    // Первая установка берёт вкладку под контроль — это не обновление. Иначе новую версию
    // активировала другая вкладка: если эта работает на старой — предлагаем перезагрузиться
    if (wasControlled) void offerIfOutdated(container.controller)
  })

  registration = await container.register(SERVICE_WORKER_URL, {
    scope: '/',
    updateViaCache: 'none',
  })
  const current = registration
  const track = (worker: ServiceWorker | null) => {
    worker?.addEventListener('statechange', () => {
      // installed при наличии контроллера — новая версия скачана и ждёт; без контроллера — первая установка
      if (worker.state === 'installed' && container.controller) void onWaiting(worker)
    })
  }
  if (current.waiting && container.controller) void onWaiting(current.waiting)
  track(current.installing)
  current.addEventListener('updatefound', () => track(current.installing))
  lastCheck = Date.now()
  scheduleUpdateChecks(current)
}

async function onWaiting(worker: ServiceWorker): Promise<void> {
  if (await runsOn(worker)) {
    expected = 'silent'
    post(worker, { type: 'pwa:skip-waiting' })
  } else {
    available.value = true
  }
}

async function offerIfOutdated(worker: ServiceWorker | null): Promise<void> {
  if (worker && !(await runsOn(worker))) available.value = true
}

/** Входной скрипт этой вкладки (из её index.html) — по нему узнаём, из какой она версии */
function entryScript(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]')
  return script ? new URL(script.src).pathname : null
}

/** Работает ли вкладка на версии этого service worker: есть ли её входной скрипт в его оболочке */
function runsOn(worker: ServiceWorker): Promise<boolean> {
  const path = entryScript()
  if (!path) return Promise.resolve(false)
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => resolve(false), REPLY_TIMEOUT_MS)
    channel.port1.onmessage = (event: MessageEvent<PwaHasFileReply>) => {
      clearTimeout(timer)
      resolve(event.data.has)
    }
    post(worker, { type: 'pwa:has-file', path }, [channel.port2])
  })
}

function post(worker: ServiceWorker, message: PwaRequest, transfer: Transferable[] = []): void {
  worker.postMessage(message, transfer)
}

function scheduleUpdateChecks(current: ServiceWorkerRegistration): void {
  const check = () => {
    if (!navigator.onLine) return
    lastCheck = Date.now()
    current.update().catch(() => {
      // Нет сети или сервер недоступен — проверим в следующий раз
    })
  }
  setInterval(check, UPDATE_INTERVAL_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > UPDATE_THROTTLE_MS)
      check()
  })
  window.addEventListener('online', check)
}

function reload(): void {
  if (reloading) return
  reloading = true
  window.location.reload()
  // Перезагрузку отменили (beforeunload в форме с несохранёнными изменениями) — вернём кнопку
  setTimeout(() => {
    reloading = false
    applying.value = false
  }, RELOAD_FALLBACK_MS)
}

/** «Обновить»: активировать ожидающую версию и перезагрузить вкладку */
function apply(): void {
  applying.value = true
  const waiting = registration?.waiting
  if (!waiting) {
    // Новая версия уже активна (её включила другая вкладка) — достаточно перезагрузки
    reload()
    return
  }
  expected = 'reload'
  post(waiting, { type: 'pwa:skip-waiting' })
  // Подстраховка, если controllerchange не придёт
  fallbackTimer = setTimeout(reload, RELOAD_FALLBACK_MS)
}

/** «Позже»: скрыть тост. Новая версия включится сама, когда закроются все вкладки impact log */
function dismiss(): void {
  available.value = false
}

export function usePwaUpdate() {
  return {
    available: readonly(available),
    applying: readonly(applying),
    apply,
    dismiss,
  }
}
