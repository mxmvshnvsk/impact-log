import { parseRecoveryKey } from '@impact-log/core/crypto'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorKey } from '@/account'

/**
 * Поле Recovery Key (ILRK1-…): формат и контрольная сумма проверяются прямо в поле, до запроса к серверу.
 * Правила форм (docs/design-system.md): пустое не ругаем до отправки; после первой проверки — на каждый ввод.
 * Значение живёт только в памяти формы; после отправки его стирает reset().
 */
export function useRecoveryKeyField(onInput?: () => void) {
  const { t } = useI18n()
  const value = ref('')
  const error = ref<string | null>(null)
  const inputRef = ref<{ focus: () => void } | null>(null)
  let touched = false

  async function check(): Promise<boolean> {
    if (!value.value.trim()) {
      error.value = t('errors.RECOVERY_KEY_FORMAT')
      return false
    }
    try {
      ;(await parseRecoveryKey(value.value)).fill(0)
      error.value = null
      return true
    } catch (cause) {
      error.value = t(errorKey(cause, 'recovery'))
      return false
    }
  }

  watch(value, () => {
    onInput?.()
    if (touched) void check()
  })

  function onBlur() {
    if (!value.value.trim()) return
    touched = true
    void check()
  }

  /** При отправке: проверить и, если нужно, вернуть фокус в поле */
  async function validate(options: { focus?: boolean } = {}): Promise<boolean> {
    touched = true
    const valid = await check()
    if (!valid && options.focus) inputRef.value?.focus()
    return valid
  }

  /** Ошибка от сервера (ключ не подошёл) — под полем */
  function fail(message: string) {
    error.value = message
    inputRef.value?.focus()
  }

  function reset() {
    touched = false
    value.value = ''
    error.value = null
  }

  return { value, error, inputRef, onBlur, validate, fail, reset }
}
