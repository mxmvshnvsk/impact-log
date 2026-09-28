import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'

export type UiTextareaProps = {
  modelValue: string
  label: string
  id?: string
  name?: string
  hint?: string
  /** Уже переведённый текст ошибки */
  error?: string | null
  rows?: number
  maxlength?: number
  placeholder?: string
  /** Высота растёт вместе с текстом (не меньше rows строк) */
  autoresize?: boolean
  /** Показать счётчик «n / maxlength» рядом с подписью */
  counter?: boolean
  disabled?: boolean
  /** Скрыть подпись визуально (остаётся для скринридеров) */
  hideLabel?: boolean
  monospace?: boolean
}

export type UiTextareaEmits = {
  'update:modelValue': [value: string]
  focus: []
  blur: []
  keydown: [event: KeyboardEvent]
}

type Emit = <K extends keyof UiTextareaEmits>(event: K, ...args: UiTextareaEmits[K]) => void

export function useUiTextarea(props: UiTextareaProps, emit: Emit) {
  const generatedId = useId()
  const fieldId = computed(() => props.id ?? generatedId)
  const fieldRef = ref<HTMLTextAreaElement | null>(null)

  const describedBy = computed(() =>
    props.error || props.hint ? `${fieldId.value}-message` : undefined,
  )
  const length = computed(() => props.modelValue.length)
  const nearLimit = computed(
    () => props.maxlength !== undefined && length.value > props.maxlength * 0.9,
  )

  /** Подгоняем высоту под содержимое: сначала сбрасываем, потом берём scrollHeight */
  function resize() {
    const el = fieldRef.value
    if (!props.autoresize || !el) return
    el.style.height = 'auto'
    const border = el.offsetHeight - el.clientHeight
    el.style.height = `${el.scrollHeight + border}px`
  }

  function onInput(event: Event) {
    emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
    resize()
  }

  watch(
    () => props.modelValue,
    () => nextTick(resize),
  )
  onMounted(resize)

  function focus() {
    fieldRef.value?.focus()
  }

  return { fieldId, fieldRef, describedBy, length, nearLimit, onInput, focus, resize }
}
