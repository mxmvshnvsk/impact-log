import { KeyRound, LockKeyhole, Smartphone } from 'lucide-vue-next'
import { nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { type SecurityAction, securityAnchor } from './anchor'

export type { SecurityAction }

const ROWS = [
  { key: 'password', icon: LockKeyhole },
  { key: 'recoveryKey', icon: KeyRound },
  { key: 'totp', icon: Smartphone },
] as const

/** Что делать, если что-то потеряли (ADR-0008 §7): Recovery Key + ещё один фактор, без него — 48 часов */
const RECOVERY_SCHEME = ['password', 'phone', 'all'] as const

function actionFromHash(hash: string): SecurityAction | null {
  return ROWS.find((row) => hash === `#${securityAnchor(row.key)}`)?.key ?? null
}

/**
 * Безопасность аккаунта: смена пароля, перевыпуск Recovery Key и 2FA — по одной форме за раз.
 * #security-<действие> открывает нужную форму (ссылка из предупреждения об отложенном восстановлении).
 */
export function useSecurityPanel() {
  const { t } = useI18n()
  const route = useRoute()
  const active = ref<SecurityAction | null>(null)
  const done = ref<SecurityAction | null>(null)

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

  onMounted(openFromHash)
  watch(() => route.hash, openFromHash)

  return {
    t,
    rows: ROWS,
    scheme: RECOVERY_SCHEME,
    anchor: securityAnchor,
    active,
    done,
    open,
    close,
    finish,
  }
}
