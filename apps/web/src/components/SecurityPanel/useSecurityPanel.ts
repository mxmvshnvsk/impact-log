import { KeyRound, LockKeyhole, Smartphone } from 'lucide-vue-next'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

export type SecurityAction = 'password' | 'recoveryKey' | 'totp'

const ROWS = [
  { key: 'password', icon: LockKeyhole },
  { key: 'recoveryKey', icon: KeyRound },
  { key: 'totp', icon: Smartphone },
] as const

/** Безопасность аккаунта: смена пароля, перевыпуск Recovery Key и 2FA — по одной форме за раз */
export function useSecurityPanel() {
  const { t } = useI18n()
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

  return { t, rows: ROWS, active, done, open, close, finish }
}
