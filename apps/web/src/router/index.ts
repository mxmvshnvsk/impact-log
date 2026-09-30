import { watch } from 'vue'
import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { ensureVault, useVault } from '@/composables/useVault'
import { i18n } from '@/i18n'

declare module 'vue-router' {
  interface RouteMeta {
    /** Каркас страницы; adaptive — app, если есть локальное хранилище, иначе public */
    layout: 'app' | 'auth' | 'public' | 'adaptive'
    /**
     * vault — нужно локальное хранилище (иначе → лендинг);
     * guest — только без хранилища (лендинг), с хранилищем → журнал;
     * any — всем.
     * Аккаунт синхронизации опционален и проверяется внутри экранов, а не роутером.
     */
    access: 'vault' | 'guest' | 'any'
    /** Ключ i18n заголовка вкладки */
    title?: string
  }
}

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (to, _from, saved) => saved ?? (to.hash ? undefined : { top: 0 }),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: () => import('@/views/LandingView'),
      meta: { layout: 'public', access: 'guest' },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView'),
      meta: { layout: 'app', access: 'vault', title: 'nav.dashboard' },
    },
    {
      path: '/impacts/new',
      name: 'impact-new',
      component: () => import('@/views/ImpactEditView'),
      meta: { layout: 'app', access: 'vault', title: 'nav.newImpact' },
    },
    {
      path: '/impacts/:id',
      name: 'impact',
      component: () => import('@/views/ImpactView'),
      meta: { layout: 'app', access: 'vault', title: 'nav.impact' },
    },
    {
      path: '/impacts/:id/edit',
      name: 'impact-edit',
      component: () => import('@/views/ImpactEditView'),
      meta: { layout: 'app', access: 'vault', title: 'nav.editImpact' },
    },
    {
      path: '/insights',
      name: 'insights',
      component: () => import('@/views/InsightsView'),
      meta: { layout: 'app', access: 'vault', title: 'nav.insights' },
    },
    {
      path: '/review',
      name: 'review',
      component: () => import('@/views/ReviewView'),
      meta: { layout: 'app', access: 'vault', title: 'nav.review' },
    },
    {
      path: '/settings',
      component: () => import('@/views/SettingsView'),
      meta: { layout: 'app', access: 'vault', title: 'nav.settings' },
      children: [
        { path: '', name: 'settings', redirect: { name: 'settings-account' } },
        {
          path: 'account',
          name: 'settings-account',
          component: () => import('@/views/SettingsAccountView'),
          meta: { layout: 'app', access: 'vault', title: 'nav.settings' },
        },
        {
          path: 'data',
          name: 'settings-data',
          component: () => import('@/views/SettingsDataView'),
          meta: { layout: 'app', access: 'vault', title: 'nav.settings' },
        },
      ],
    },
    {
      // Черновик из расширения/CLI/VS Code приходит во фрагменте (#draft=…) и не уходит на сервер
      path: '/capture',
      name: 'capture',
      component: () => import('@/views/CaptureView'),
      meta: { layout: 'adaptive', access: 'any', title: 'nav.capture' },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView'),
      meta: { layout: 'auth', access: 'any', title: 'auth.login.title' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView'),
      meta: { layout: 'auth', access: 'any', title: 'auth.register.title' },
    },
    {
      path: '/recover',
      name: 'recover',
      component: () => import('@/views/RecoverView'),
      meta: { layout: 'auth', access: 'any', title: 'nav.recover' },
    },
    {
      path: '/principles',
      name: 'principles',
      component: () => import('@/views/PrinciplesView'),
      meta: { layout: 'adaptive', access: 'any', title: 'nav.principles' },
    },
    ...(import.meta.env.DEV
      ? [
          {
            path: '/dev/ui',
            name: 'ui-kit',
            component: () => import('@/views/UiKitView'),
            meta: { layout: 'public' as const, access: 'any' as const },
          },
        ]
      : []),
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView'),
      meta: { layout: 'public', access: 'any', title: 'notFound.title' },
    },
  ],
})

router.beforeEach(async (to) => {
  await ensureVault()
  const { hasVault } = useVault()

  if (to.meta.access === 'vault' && !hasVault.value) return { name: 'landing' }
  if (to.meta.access === 'guest' && hasVault.value) return { name: 'dashboard' }
  return true
})

/** Заголовок вкладки и описание для поисковиков — на языке интерфейса (статичные теги — src/seo/seoPlugin.ts) */
function applyTitle(to: RouteLocationNormalized) {
  const { t } = i18n.global
  const title = to.meta.title ? t(to.meta.title) : null
  document.title = title ? `${title} · impact log` : t('seo.title')
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('seo.description'))
}

router.afterEach((to) => {
  applyTitle(to)
  forgetChunkReload()
})

// Сменили язык — заголовок вкладки переводится сразу, а не при следующем переходе
watch(
  () => i18n.global.locale.value,
  () => applyTitle(router.currentRoute.value),
)

/*
 * Чанк экрана не загрузился — чаще всего вкладка открыта со старой сборки, а после деплоя файлов с такими
 * именами уже нет. Если сеть есть, один раз открываем целевой адрес заново: свежий index.html знает новые чанки.
 * Без сети остаёмся на текущем экране. Защита от цикла — флаг попытки в sessionStorage
 * (снимается после любой успешной навигации).
 */
const CHUNK_RELOAD_KEY = 'impact-log:chunk-reload'
const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i

function forgetChunkReload() {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY)
  } catch {
    // sessionStorage недоступен — нечего очищать
  }
}

router.onError((error, to) => {
  const message = error instanceof Error ? error.message : String(error)
  if (!CHUNK_ERROR.test(message) || !navigator.onLine) return
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
  } catch {
    // без sessionStorage защиты от цикла нет — не перезагружаем
    return
  }
  window.location.assign(to.fullPath)
})

/**
 * Безопасный redirect: только внутренние пути без фрагмента (в нём может быть черновик захвата),
 * обратной косой черты и пробельных символов; по умолчанию — журнал
 */
export function safeRedirect(value: unknown): string {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !/[#\\\s]/.test(value)
    ? value
    : '/dashboard'
}
