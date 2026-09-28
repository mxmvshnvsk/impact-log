import { formatAccountId } from '@impact-log/core'
import { CloudUpload, LogIn, LogOut, RefreshCw, Settings } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { type RouteLocationRaw, useRoute } from 'vue-router'
import { useAccount } from '@/composables/useAccount'
import { useSync } from '@/composables/useSync'
import { redirectTarget } from '@/utils/navigation'
import { initial } from '@/utils/strings'

type MenuItem = {
  key: string
  label: string
  icon: typeof Settings
  to?: RouteLocationRaw
  action?: () => void
  accent?: boolean
}

/**
 * Меню аккаунта в шапке: логин или «Локально», переходы в настройки, «Синхронизировать сейчас»,
 * вход/включение синхронизации и выход. Сессия истекла — «Войти снова».
 */
export function useAccountMenu() {
  const { t } = useI18n()
  const route = useRoute()
  const accountFlow = useAccount()
  const sync = useSync()

  const rootRef = ref<HTMLElement | null>(null)
  const triggerRef = ref<HTMLButtonElement | null>(null)
  const menuId = useId()
  const open = ref(false)
  const logoutOpen = ref(false)

  const mode = accountFlow.mode
  const login = computed(() => accountFlow.account.value?.login ?? '')
  const label = computed(() => (mode.value === 'local' ? t('account.menu.local') : login.value))
  const hint = computed(() => {
    if (mode.value === 'local') return t('account.menu.localHint')
    if (mode.value === 'signed-out') return t('account.menu.signedOutHint')
    const accountId = accountFlow.account.value?.accountId
    return accountId ? `${t('account.profile.accountId')} ${formatAccountId(accountId)}` : ''
  })
  const avatar = computed(() => initial(login.value))

  // Только путь и безопасный query: фрагмент (#draft=…) и пользовательский текст в redirect не попадают
  const loginAgain = computed<RouteLocationRaw>(() => ({
    name: 'login',
    query: { redirect: redirectTarget(route) },
  }))

  const items = computed<MenuItem[]>(() => {
    const settings: MenuItem = {
      key: 'settings',
      label: t('account.menu.settings'),
      icon: Settings,
      to: { name: 'settings-account' },
    }
    if (mode.value === 'local') {
      return [
        settings,
        {
          key: 'enable',
          label: t('account.menu.enableSync'),
          icon: CloudUpload,
          to: { name: 'register' },
          accent: true,
        },
        { key: 'login', label: t('account.menu.signIn'), icon: LogIn, to: { name: 'login' } },
      ]
    }
    const logout: MenuItem = {
      key: 'logout',
      label: t('account.menu.logout'),
      icon: LogOut,
      action: () => {
        close(false)
        logoutOpen.value = true
      },
    }
    if (mode.value === 'signed-out') {
      return [
        {
          key: 'login',
          label: t('account.menu.signInAgain'),
          icon: LogIn,
          to: loginAgain.value,
          accent: true,
        },
        settings,
        logout,
      ]
    }
    return [
      settings,
      {
        key: 'sync',
        label: t('account.menu.syncNow'),
        icon: RefreshCw,
        action: () => {
          close()
          void sync.syncNow().catch(() => {})
        },
      },
      logout,
    ]
  })

  function menuItems(): HTMLElement[] {
    return Array.from(rootRef.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
  }

  async function show() {
    open.value = true
    await nextTick()
    menuItems()[0]?.focus()
  }

  function close(returnFocus = true) {
    if (!open.value) return
    open.value = false
    if (returnFocus) triggerRef.value?.focus()
  }

  function toggle() {
    if (open.value) close()
    else void show()
  }

  /** Esc закрывает, стрелки ходят по пунктам */
  function onKeydown(event: KeyboardEvent) {
    if (!open.value) return
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const list = menuItems()
    const index = list.indexOf(document.activeElement as HTMLElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    list[(index + step + list.length) % list.length]?.focus()
  }

  // Клик мимо меню закрывает его
  function onPointerDown(event: PointerEvent) {
    if (open.value && !rootRef.value?.contains(event.target as Node)) close(false)
  }
  document.addEventListener('pointerdown', onPointerDown)
  onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown))

  watch(
    () => route.fullPath,
    () => close(false),
  )

  return {
    t,
    rootRef,
    triggerRef,
    menuId,
    open,
    mode,
    label,
    hint,
    avatar,
    items,
    toggle,
    close,
    onKeydown,
    logoutOpen,
  }
}
