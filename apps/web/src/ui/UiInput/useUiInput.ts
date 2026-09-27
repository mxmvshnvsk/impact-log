import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'

export type UiInputProps = {
  modelValue: string
  label?: string
  name?: string
  type?: 'text' | 'password'
  autocomplete?: string
  inputmode?: 'text' | 'numeric' | 'email'
  placeholder?: string
  hint?: string
  /** Уже переведённый текст ошибки */
  error?: string | null
  maxlength?: number
  disabled?: boolean
  autofocus?: boolean
  /** Кнопка «показать пароль» */
  revealable?: boolean
  /** Моноширинный шрифт — для кодов и ключей */
  monospace?: boolean
}

export type UiInputEmits = {
  'update:modelValue': [value: string]
  focus: []
  blur: []
  /** Пароль показан/скрыт */
  reveal: [revealed: boolean]
}

type Emit = <K extends keyof UiInputEmits>(event: K, ...args: UiInputEmits[K]) => void

export function useUiInput(props: UiInputProps, emit: Emit) {
  const { t } = useI18n()
  const id = useId()
  const inputRef = ref<HTMLInputElement | null>(null)
  const revealed = ref(false)

  const inputType = computed(() =>
    props.type === 'password' && !revealed.value ? 'password' : 'text',
  )
  const describedBy = computed(() => (props.error || props.hint ? `${id}-message` : undefined))

  function onInput(event: Event) {
    emit('update:modelValue', (event.target as HTMLInputElement).value)
  }

  function toggleReveal() {
    revealed.value = !revealed.value
    emit('reveal', revealed.value)
    inputRef.value?.focus()
  }

  function focus() {
    inputRef.value?.focus()
  }

  return { t, id, inputRef, inputType, revealed, describedBy, onInput, toggleReveal, focus }
}
