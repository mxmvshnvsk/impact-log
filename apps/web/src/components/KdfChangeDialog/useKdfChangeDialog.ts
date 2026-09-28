import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { KdfChange } from '@/account'

export type KdfChangeDialogProps = { change: KdfChange | null }
export type KdfChangeDialogEmits = { answer: [proceed: boolean] }
type Emit = (event: 'answer', proceed: boolean) => void

/**
 * TOFU параметров KDF: сервер прислал для этого логина более слабые параметры Argon2id или другую соль,
 * чем запомнило устройство, а пароль на этом устройстве не меняли. Вход продолжается только по явному
 * согласию; по умолчанию (Esc, фокус) — отмена.
 */
export function useKdfChangeDialog(props: KdfChangeDialogProps, emit: Emit) {
  const { t } = useI18n()

  const reasons = computed(() => {
    const change = props.change
    if (!change) return []
    return [
      ...(change.weaker ? [t('auth.kdfChange.weaker')] : []),
      ...(change.saltChanged ? [t('auth.kdfChange.salt')] : []),
    ]
  })

  return {
    t,
    reasons,
    proceed: () => emit('answer', true),
    cancel: () => emit('answer', false),
  }
}
