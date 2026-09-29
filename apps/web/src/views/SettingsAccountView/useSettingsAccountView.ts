import { formatAccountId } from '@impact-log/core'
import { ArrowRightLeft, Lock, UserRound } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { type RouteLocationRaw, useRouter } from 'vue-router'
import { errorKey } from '@/account'
import { useAccount } from '@/composables/useAccount'
import { useClipboard } from '@/composables/useClipboard'
import { useEntitlements } from '@/composables/useEntitlements'
import { useSync } from '@/composables/useSync'
import { formatBytes, formatNumber } from '@/utils/numbers'

const LOCAL_POINTS = [
  { key: 'e2ee', icon: Lock },
  { key: 'noEmail', icon: UserRound },
  { key: 'keep', icon: ArrowRightLeft },
] as const

/**
 * «Аккаунт и синхронизация»: без аккаунта — приглашение включить синхронизацию; с аккаунтом —
 * профиль, синхронизация, устройства, безопасность, выход и удаление.
 */
export function useSettingsAccountView() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const accountFlow = useAccount()
  const entitlements = useEntitlements()
  const sync = useSync()
  const clipboard = useClipboard()

  const account = accountFlow.account
  const accountId = computed(() => formatAccountId(account.value?.accountId ?? ''))

  const usageRows = computed(() => {
    const usage = accountFlow.usage.value ?? sync.usage.value
    if (!usage) return []
    const limits = entitlements.profile.value.limits
    const format = (used: number, max: number | null) =>
      max === null
        ? t('account.profile.unlimited', { used })
        : t('account.profile.of', { used, max })
    return [
      format(usage.activeImpacts, limits.maxActiveImpacts),
      format(usage.devices, limits.maxDevices),
    ]
  })

  /**
   * Хранилище синхронизации на сервере: байты шифротекста и живые объекты против лимитов тарифа.
   * Показываем, только если сервер прислал эти поля.
   */
  const storageMeters = computed(() => {
    const usage = accountFlow.usage.value ?? sync.usage.value
    if (!usage || typeof usage.storageBytes !== 'number' || typeof usage.objects !== 'number') {
      return []
    }
    const limits = entitlements.profile.value.limits
    const meter = (
      key: string,
      used: number,
      max: number | null,
      format: (value: number) => string,
    ) => ({
      key,
      label: t(`account.profile.storageMeters.${key}`),
      text:
        max === null
          ? t('account.profile.unlimited', { used: format(used) })
          : t('account.profile.of', { used: format(used), max: format(max) }),
      value: max === null ? 0 : Math.min(used, max),
      max: max ?? 0,
    })
    return [
      meter('bytes', usage.storageBytes, limits.maxStorageBytes ?? null, (value) =>
        formatBytes(value, locale.value),
      ),
      meter('objects', usage.objects, limits.maxObjects ?? null, (value) =>
        formatNumber(value, locale.value),
      ),
    ]
  })

  onMounted(async () => {
    if (!account.value) return
    const state = await accountFlow.session.refresh()
    if (state === 'active') await accountFlow.refreshEntitlements()
  })

  // ---------- удаление: оставить записи или стереть устройство ----------
  const deletedLogin = accountFlow.deletedLogin
  const wiping = ref(false)
  const wipeError = ref<string | null>(null)

  watch(deletedLogin, (login) => {
    if (login !== null) window.scrollTo({ top: 0 })
  })

  function keepAfterDelete() {
    deletedLogin.value = null
  }

  async function wipe() {
    wiping.value = true
    wipeError.value = null
    try {
      await accountFlow.wipeDevice()
      await router.replace({ name: 'landing' })
    } catch (cause) {
      wipeError.value = errorKey(cause)
    } finally {
      wiping.value = false
    }
  }

  /** Почему нужно войти снова: ключ шифрования сменили на другом устройстве — или сессия закончилась */
  const signedOutText = computed(() =>
    sync.lastError.value === 'KEY_CHANGED'
      ? t('account.signedOut.keyChanged')
      : t('account.signedOut.text'),
  )

  return {
    t,
    signedOutText,
    mode: accountFlow.mode,
    account,
    accountId,
    plan: entitlements.plan,
    usageRows,
    storageMeters,
    copied: clipboard.copied,
    copyId: () => clipboard.copy(account.value?.accountId ?? ''),
    loginAgain: {
      name: 'login',
      query: { redirect: '/settings/account' },
    } satisfies RouteLocationRaw,
    localPoints: LOCAL_POINTS,
    deletedLogin,
    keepAfterDelete,
    wiping,
    wipeError,
    wipe,
  }
}
