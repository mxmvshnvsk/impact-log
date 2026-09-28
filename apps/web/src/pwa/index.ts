/*
 * PWA: офлайн-оболочка (service worker), обновления, статус сети, цвет панели браузера.
 * docs/pwa.md. swBuildPlugin.ts и sw.ts сюда не экспортируются: первый выполняется в Node при сборке,
 * второй — отдельный скрипт service worker.
 */
import { syncThemeColor } from './themeColor'
import { registerServiceWorker } from './update'

export { useOnline } from './online'
export { usePwaUpdate } from './update'

/** Вызывается один раз при старте приложения (main.ts) */
export function initPwa(): void {
  syncThemeColor()
  registerServiceWorker()
}
