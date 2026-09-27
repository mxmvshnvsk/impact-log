import { computed, ref, useId } from 'vue'
import { onlyDigits } from '@/utils/strings'

export type UiOtpProps = {
  modelValue: string
  length?: number
  label?: string
  error?: string | null
  autofocus?: boolean
  disabled?: boolean
}

export type UiOtpEmits = {
  'update:modelValue': [value: string]
  /** Введены все цифры */
  complete: [value: string]
  focus: []
  blur: []
}

type Emit = <K extends keyof UiOtpEmits>(event: K, ...args: UiOtpEmits[K]) => void

/**
 * Одно настоящее поле ввода поверх «ячеек» — так работают вставка из буфера,
 * автоподстановка кода из SMS/менеджера паролей и экранные клавиатуры.
 */
export function useUiOtpInput(props: UiOtpProps, emit: Emit) {
  const id = useId()
  const inputRef = ref<HTMLInputElement | null>(null)
  const focused = ref(false)
  const length = computed(() => props.length ?? 6)

  const cells = computed(() =>
    Array.from({ length: length.value }, (_, index) => props.modelValue[index] ?? ''),
  )
  const activeIndex = computed(() => Math.min(props.modelValue.length, length.value - 1))

  function onInput(event: Event) {
    const target = event.target as HTMLInputElement
    const value = onlyDigits(target.value).slice(0, length.value)
    target.value = value
    emit('update:modelValue', value)
    if (value.length === length.value) emit('complete', value)
  }

  function onFocus() {
    focused.value = true
    emit('focus')
  }

  function onBlur() {
    focused.value = false
    emit('blur')
  }

  function focus() {
    inputRef.value?.focus()
  }

  return { id, inputRef, cells, activeIndex, focused, onInput, onFocus, onBlur, focus }
}
