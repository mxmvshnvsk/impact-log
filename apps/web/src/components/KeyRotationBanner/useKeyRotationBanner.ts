import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { type RouteLocationRaw, useRoute } from 'vue-router'
import { securityAnchor } from '@/components/SecurityPanel/anchor'
import { useKeyRotation } from '@/composables/useKeyRotation'

/** Фокус окна / возврат на вкладку — сверка незавершённой ротации не чаще раза в минуту */
const FOCUS_MIN_MS = 60_000

export type KeyRotationBannerView = 'running' | 'unfinished' | 'failed' | 'done' | 'notice'

/**
 * Смена ключа шифрования на любой странице приложения (кроме настроек аккаунта — там всё показывает
 * раздел «Безопасность»): идёт (не закрывайте вкладку), не закончена (продолжить / отменить), сбой,
 * готово, отменена.
 */
export function useKeyRotationBanner() {
  const { t, locale } = useI18n()
  const route = useRoute()
  const flow = useKeyRotation()

  const view = computed<KeyRotationBannerView | null>(() => {
    if (route.name === 'settings-account') return null
    const phase = flow.phase.value
    if (phase === 'running' || phase === 'starting') return 'running'
    if (phase === 'failed') return 'failed'
    if (phase === 'done') return 'done'
    if (flow.unfinished.value) return 'unfinished'
    if (flow.notice.value === 'cancelled') return 'notice'
    return null
  })

  const startedAt = computed(() => {
    const iso = flow.unfinished.value?.startedAt
    return iso
      ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(iso),
        )
      : ''
  })

  const title = computed(() => {
    switch (view.value) {
      case 'running':
        return t('account.keyRotation.banner.running')
      case 'failed':
        return t('account.keyRotation.failed.title')
      case 'done':
        return t('account.keyRotation.done.title')
      case 'notice':
        return t('account.keyRotation.banner.cancelledTitle')
      default:
        return t('account.keyRotation.unfinished.title')
    }
  })

  const text = computed(() => {
    const error = flow.error.value
    const notice = flow.notice.value
    switch (view.value) {
      case 'running':
        return t('account.keyRotation.banner.runningText')
      case 'failed':
        return `${error ? `${t(error)}. ` : ''}${t('account.keyRotation.failed.text')}`
      case 'done':
        return t('account.keyRotation.done.text')
      case 'notice':
        return notice ? t(`account.keyRotation.notice.${notice}`) : ''
      default:
        return t('account.keyRotation.unfinished.text', { date: startedAt.value })
    }
  })

  // Черновик на устройстве, а сверка не прошла (не было сети при старте) — пробуем при возврате на вкладку
  let checkedAt = 0
  function check() {
    if (document.visibilityState !== 'visible' || Date.now() - checkedAt < FOCUS_MIN_MS) return
    checkedAt = Date.now()
    void flow.inspect()
  }
  onMounted(() => {
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('focus', check)
    document.removeEventListener('visibilitychange', check)
  })

  const abortOpen = ref(false)
  const aborting = ref(false)

  async function confirmAbort() {
    if (aborting.value) return
    aborting.value = true
    try {
      await flow.abort()
    } finally {
      aborting.value = false
      abortOpen.value = false
    }
  }

  /** Подробности и все действия — Настройки → Безопасность */
  const detailsTo: RouteLocationRaw = {
    name: 'settings-account',
    hash: `#${securityAnchor('keyRotation')}`,
  }

  return {
    t,
    view,
    title,
    text,
    percent: flow.percent,
    resume: () => void flow.resume(),
    dismiss: () => flow.dismiss(),
    abortOpen,
    aborting,
    confirmAbort,
    detailsTo,
  }
}
