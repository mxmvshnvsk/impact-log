import { KeyRound, LockKeyhole, RefreshCcwDot, Smartphone } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useKeyRotation } from '@/composables/useKeyRotation'
import { type SecurityAction, securityAnchor } from './anchor'

export type { SecurityAction }

const ROWS = [
  { key: 'password', icon: LockKeyhole },
  { key: 'recoveryKey', icon: KeyRound },
  { key: 'totp', icon: Smartphone },
  { key: 'keyRotation', icon: RefreshCcwDot },
] as const

/** Что делать, если что-то потеряли (ADR-0008 §7): Recovery Key + ещё один фактор, без него — 48 часов */
const RECOVERY_SCHEME = ['password', 'phone', 'all'] as const

function actionFromHash(hash: string): SecurityAction | null {
  return ROWS.find((row) => hash === `#${securityAnchor(row.key)}`)?.key ?? null
}

/**
 * Безопасность аккаунта: смена пароля, перевыпуск Recovery Key и 2FA, смена ключа шифрования — по одной
 * форме за раз. #security-<действие> открывает нужную форму (ссылки из предупреждения об отложенном
 * восстановлении, после отзыва устройства, после восстановления доступа).
 * Смена ключа показывается и без открытия, если требует внимания: идёт, не закончена, начата на другом
 * устройстве или только что отменена.
 */
export function useSecurityPanel() {
  const { t } = useI18n()
  const route = useRoute()
  const active = ref<SecurityAction | null>(null)
  const done = ref<SecurityAction | null>(null)
  const rotation = useKeyRotation()
  const rotationAttention = computed(
    () =>
      rotation.phase.value !== 'idle' ||
      rotation.unfinished.value !== null ||
      rotation.otherDevice.value !== null ||
      rotation.notice.value !== null,
  )

  /** Открыта ли форма строки (смена ключа — ещё и когда требует внимания) */
  function expanded(action: SecurityAction): boolean {
    return active.value === action || (action === 'keyRotation' && rotationAttention.value)
  }

  function open(action: SecurityAction) {
    done.value = null
    active.value = action
  }

  function close() {
    active.value = null
  }

  function finish(action: SecurityAction) {
    active.value = null
    done.value = action
  }

  async function openFromHash() {
    const action = actionFromHash(route.hash)
    if (!action) return
    open(action)
    await nextTick()
    document.getElementById(securityAnchor(action))?.scrollIntoView({ block: 'start' })
  }

  onMounted(() => {
    // Идёт ли ротация ключа (на этом или другом устройстве) — чтобы показать её, не дожидаясь клика
    void rotation.inspect(true)
    void openFromHash()
  })
  watch(() => route.hash, openFromHash)

  return {
    t,
    rows: ROWS,
    scheme: RECOVERY_SCHEME,
    anchor: securityAnchor,
    active,
    done,
    expanded,
    open,
    close,
    finish,
  }
}
