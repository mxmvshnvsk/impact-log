import { createRouter, createWebHistory } from 'vue-router'
import { ensureSession, useSession } from '@/composables/useSession'
import { i18n } from '@/i18n'

declare module 'vue-router' {
  interface RouteMeta {
    /** Каркас страницы; adaptive — app для вошедших, public для гостей */
    layout: 'app' | 'auth' | 'public' | 'adaptive'
    /** user — только для вошедших, guest — только для гостей, any — всем */
    access: 'user' | 'guest' | 'any'
    /** Ключ i18n заголовка вкладки */
    title?: string
  }
}

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView'),
      meta: { layout: 'app', access: 'user', title: 'nav.home' },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView'),
      meta: { layout: 'auth', access: 'guest', title: 'auth.login.title' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView'),
      meta: { layout: 'auth', access: 'guest', title: 'auth.register.title' },
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
  await ensureSession()
  const { isAuthenticated } = useSession()

  if (to.meta.access === 'user' && !isAuthenticated.value) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }
  if (to.meta.access === 'guest' && isAuthenticated.value) {
    return { name: 'home' }
  }
  return true
})

router.afterEach((to) => {
  const title = to.meta.title ? i18n.global.t(to.meta.title) : null
  document.title = title ? `${title} · impact log` : 'impact log'
})

/** Безопасный redirect после входа: только внутренние пути */
export function safeRedirect(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}
