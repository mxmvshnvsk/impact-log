import type { Device } from '@impact-log/shared'
import { Laptop, Monitor, Smartphone, Tablet } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  DEVICE_LABEL_MAX,
  decryptDeviceLabel,
  encryptDeviceLabel,
  errorKey,
  isSignedOutError,
} from '@/account'
import { devicesApi } from '@/api/account'
import { useAccount } from '@/composables/useAccount'
import { useSession } from '@/composables/useSession'

type DeviceView = Device & {
  /** Расшифрованное название (null — нет или не расшифровалось) */
  label: string | null
  undecryptable: boolean
}

const ICONS: [RegExp, typeof Monitor][] = [
  [/iOS|Android/, Smartphone],
  [/iPadOS/, Tablet],
  [/macOS|Windows|Linux|ChromeOS/, Laptop],
]

/**
 * Устройства аккаунта: названия расшифровываются MK на клиенте. Текущее можно переименовать,
 * остальные — отозвать (сессии устройства удаляются, «доверие» снимается; скачанные данные остаются).
 */
export function useDevicesPanel() {
  const { t, locale } = useI18n()
  const session = useSession()
  const accountFlow = useAccount()

  const raw = shallowRef<DeviceView[]>([])
  const loading = ref(false)
  const loadError = ref<string | null>(null)
  const notice = ref<string | null>(null)
  const actionError = ref<string | null>(null)

  const dateFormat = computed(
    () => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }),
  )

  const devices = computed(() =>
    [...raw.value]
      .sort(
        (a, b) => Number(b.current) - Number(a.current) || b.lastSeenAt.localeCompare(a.lastSeenAt),
      )
      .map((device) => ({
        ...device,
        name:
          device.label ??
          (device.undecryptable
            ? t('account.devices.undecryptable')
            : t('account.devices.unnamed')),
        icon: ICONS.find(([pattern]) => pattern.test(device.label ?? ''))?.[1] ?? Monitor,
        lastSeen: dateFormat.value.format(new Date(device.lastSeenAt)),
        added: dateFormat.value.format(new Date(device.createdAt)),
      })),
  )

  function fail(error: unknown, target: typeof loadError) {
    if (isSignedOutError(error)) session.markExpired()
    target.value = errorKey(error)
  }

  async function load() {
    loading.value = true
    loadError.value = null
    try {
      const { devices: list } = await devicesApi.list()
      raw.value = await Promise.all(
        list.map(async (device) => {
          const label = await decryptDeviceLabel(device.deviceId, device.encryptedLabel)
          return {
            ...device,
            label,
            undecryptable: device.encryptedLabel !== null && label === null,
          }
        }),
      )
    } catch (error) {
      fail(error, loadError)
    } finally {
      loading.value = false
    }
  }

  onMounted(load)

  // ---------- переименование текущего ----------
  const renaming = ref(false)
  const draftName = ref('')
  const renameError = ref<string | null>(null)
  const saving = ref(false)
  const renameRef = ref<{ focus: () => void }[] | { focus: () => void } | null>(null)

  async function startRename(device: DeviceView) {
    notice.value = null
    actionError.value = null
    renameError.value = null
    draftName.value = device.label ?? ''
    renaming.value = true
    await nextTick()
    const input = Array.isArray(renameRef.value) ? renameRef.value[0] : renameRef.value
    input?.focus()
  }

  function cancelRename() {
    renaming.value = false
  }

  async function saveName() {
    const current = raw.value.find((device) => device.current)
    if (!current || saving.value) return
    const label = draftName.value.trim().slice(0, DEVICE_LABEL_MAX)
    saving.value = true
    renameError.value = null
    try {
      const encrypted = label ? await encryptDeviceLabel(current.deviceId, label) : null
      await devicesApi.rename(current.deviceId, encrypted)
      raw.value = raw.value.map((device) =>
        device.deviceId === current.deviceId
          ? { ...device, encryptedLabel: encrypted, label: label || null, undecryptable: false }
          : device,
      )
      renaming.value = false
      notice.value = 'account.devices.renamed'
    } catch (error) {
      fail(error, renameError)
    } finally {
      saving.value = false
    }
  }

  // ---------- отзыв ----------
  const revoking = ref<(DeviceView & { name: string }) | null>(null)
  const revokeBusy = ref(false)

  function askRevoke(device: DeviceView & { name: string }) {
    notice.value = null
    actionError.value = null
    revoking.value = device
  }

  async function confirmRevoke() {
    const target = revoking.value
    if (!target || revokeBusy.value) return
    revokeBusy.value = true
    try {
      await devicesApi.revoke(target.deviceId)
      raw.value = raw.value.filter((device) => device.deviceId !== target.deviceId)
      notice.value = 'account.devices.revoked'
      revoking.value = null
      // Счётчик устройств в профиле («Устройства: N») — с сервера, иначе он отстаёт от списка
      void accountFlow.refreshEntitlements()
    } catch (error) {
      revoking.value = null
      fail(error, actionError)
    } finally {
      revokeBusy.value = false
    }
  }

  return {
    t,
    devices,
    loading,
    loadError,
    load,
    maxLength: DEVICE_LABEL_MAX,
    renaming,
    draftName,
    renameRef,
    renameError,
    saving,
    startRename,
    cancelRename,
    saveName,
    revoking,
    revokeBusy,
    askRevoke,
    confirmRevoke,
    notice,
    actionError,
  }
}
