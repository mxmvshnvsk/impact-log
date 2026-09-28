import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'

export type UiInputProps = {
  modelValue: string
  label?: string
  /** Свой id поля (по умолчанию генерируется) */
  id?: string
  /** Подпись только для скринридеров */
  hideLabel?: boolean
  name?: string
  type?: 'text' | 'password' | 'date' | 'search' | 'url' | 'number'
  autocomplete?: string
  inputmode?: 'text' | 'numeric' | 'decimal' | 'email' | 'search' | 'url'
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
  /** Проверка орфографии (по умолчанию выключена: логины, коды) */
  spellcheck?: boolean
  /** Границы для type="date" (YYYY-MM-DD) */
  min?: string
  max?: string
  enterkeyhint?: 'enter' | 'done' | 'go' | 'next' | 'search' | 'send'
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
  const generatedId = useId()
  const id = computed(() => props.id ?? generatedId)
  const inputRef = ref<HTMLInputElement | null>(null)
  const revealed = ref(false)

  const inputType = computed(() => {
    if (props.type === 'password') return revealed.value ? 'text' : 'password'
    return props.type ?? 'text'
  })
  const describedBy = computed(() =>
    props.error || props.hint ? `${id.value}-message` : undefined,
  )

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
