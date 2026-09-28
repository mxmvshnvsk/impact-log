import { normalizeCategories, normalizeLabels } from '@impact-log/core'
import { computed, ref, useId } from 'vue'

export type ChipsInputProps = {
  modelValue: readonly string[]
  label: string
  id?: string
  /** labels — нижний регистр, пробелы → «-», показываются с «#»; categories — регистр сохраняется */
  kind?: 'labels' | 'categories'
  /** Подсказки (словарь из существующих записей, по частоте) */
  suggestions?: readonly string[]
  max?: number
  maxLength?: number
  placeholder?: string
  hint?: string
  /** Уже переведённый текст ошибки */
  error?: string | null
}

export type ChipsInputEmits = {
  'update:modelValue': [value: string[]]
  blur: []
}

type Emit = ((event: 'update:modelValue', value: string[]) => void) & ((event: 'blur') => void)

const MAX_SUGGESTIONS = 8
const SEPARATORS = /[,\n]/

function lower(value: string): string {
  return value.toLocaleLowerCase().replace(/^#+/, '')
}

/**
 * Поле-«чипсы»: Enter/запятая добавляют, Backspace в пустом поле удаляет последний, вставка «a, b, c»
 * добавляет всё сразу. Подсказки — combobox по паттерну WAI-ARIA (стрелки, Enter, Esc).
 */
export function useChipsInput(props: ChipsInputProps, emit: Emit) {
  const generatedId = useId()
  const inputId = computed(() => props.id ?? generatedId)
  const listId = `${generatedId}-list`
  const messageId = `${generatedId}-message`

  const inputRef = ref<HTMLInputElement | null>(null)
  const text = ref('')
  const open = ref(false)
  const activeIndex = ref(-1)

  const kind = computed(() => props.kind ?? 'labels')
  const max = computed(() => props.max ?? (kind.value === 'labels' ? 20 : 10))
  const maxLength = computed(() => props.maxLength ?? 40)
  const full = computed(() => props.modelValue.length >= max.value)

  function normalize(values: readonly string[]): string[] {
    return kind.value === 'labels' ? normalizeLabels(values) : normalizeCategories(values)
  }

  const filtered = computed(() => {
    if (full.value) return []
    const query = lower(text.value.trim())
    const selected = new Set(props.modelValue.map(lower))
    const candidates = (props.suggestions ?? []).filter((item) => {
      const value = lower(item)
      return !selected.has(value) && (!query || value.includes(query))
    })
    if (query)
      candidates.sort((a, b) => +!lower(a).startsWith(query) - +!lower(b).startsWith(query))
    return candidates.slice(0, MAX_SUGGESTIONS)
  })

  const listOpen = computed(() => open.value && filtered.value.length > 0)
  const activeId = computed(() =>
    listOpen.value && activeIndex.value >= 0 ? `${listId}-${activeIndex.value}` : undefined,
  )
  const describedBy = computed(() => (props.error || props.hint ? messageId : undefined))

  function add(values: readonly string[]) {
    const trimmed = values.map((value) => value.trim().slice(0, maxLength.value)).filter(Boolean)
    if (!trimmed.length) return
    const next = normalize([...props.modelValue, ...trimmed]).slice(0, max.value)
    if (next.length !== props.modelValue.length) emit('update:modelValue', next)
  }

  function commitText() {
    const value = text.value
    text.value = ''
    activeIndex.value = -1
    add(value.split(SEPARATORS))
  }

  function remove(index: number) {
    emit(
      'update:modelValue',
      props.modelValue.filter((_, i) => i !== index),
    )
    inputRef.value?.focus()
  }

  function pick(value: string) {
    text.value = ''
    activeIndex.value = -1
    add([value])
    inputRef.value?.focus()
  }

  function onInput(event: Event) {
    const input = event.target as HTMLInputElement
    const value = input.value
    open.value = true
    activeIndex.value = -1
    if (SEPARATORS.test(value)) {
      // вставили или напечатали разделитель: всё до последнего разделителя — в чипы
      const parts = value.split(SEPARATORS)
      text.value = (parts.pop() ?? '').slice(0, maxLength.value)
      add(parts)
      return
    }
    // Лимит длины — на один чип, а не на поле (maxlength обрезал бы вставку «a, b, c» до разбора)
    text.value = value.slice(0, maxLength.value)
    if (input.value !== text.value) input.value = text.value
  }

  function move(step: number) {
    open.value = true
    const count = filtered.value.length
    if (!count) return
    activeIndex.value = (activeIndex.value + step + count) % count
  }

  function onKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'Enter': {
        // Enter в этом поле никогда не отправляет форму
        event.preventDefault()
        const active = filtered.value[activeIndex.value]
        if (listOpen.value && active) pick(active)
        else if (text.value.trim()) commitText()
        break
      }
      case ',':
        event.preventDefault()
        commitText()
        break
      case 'Backspace':
        if (!text.value && props.modelValue.length) {
          event.preventDefault()
          emit('update:modelValue', props.modelValue.slice(0, -1))
        }
        break
      case 'ArrowDown':
        event.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        move(-1)
        break
      case 'Escape':
        if (listOpen.value) {
          // закрываем подсказки, но не отменяем всю форму
          event.preventDefault()
          event.stopPropagation()
          open.value = false
          activeIndex.value = -1
        }
        break
    }
  }

  function onFocus() {
    open.value = true
  }

  function onBlur() {
    if (text.value.trim()) commitText()
    open.value = false
    activeIndex.value = -1
    emit('blur')
  }

  function focus() {
    inputRef.value?.focus()
  }

  const display = (value: string) => (kind.value === 'labels' ? `#${value}` : value)

  return {
    inputId,
    listId,
    messageId,
    inputRef,
    text,
    filtered,
    listOpen,
    activeIndex,
    activeId,
    describedBy,
    full,
    max,
    display,
    remove,
    pick,
    onInput,
    onKeydown,
    onFocus,
    onBlur,
    focus,
  }
}
