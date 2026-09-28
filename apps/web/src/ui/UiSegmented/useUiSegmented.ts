import { computed, nextTick, ref } from 'vue'

export type UiSegmentedValue = string | number
export type UiSegmentedOption = { value: UiSegmentedValue; label: string; title?: string }

export type UiSegmentedProps = {
  modelValue: UiSegmentedValue
  options: readonly UiSegmentedOption[]
  /** aria-label группы */
  label: string
  size?: 'sm' | 'md'
  /** Растянуть на всю ширину, сегменты поровну */
  block?: boolean
  disabled?: boolean
}

export type UiSegmentedEmits = {
  'update:modelValue': [value: UiSegmentedValue]
}

type Emit = (event: 'update:modelValue', value: UiSegmentedValue) => void

const KEY_STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/** Радиогруппа-«таблетки»: roving tabindex, стрелки ←/→, Home/End (паттерн WAI-ARIA radio group) */
export function useUiSegmented(props: UiSegmentedProps, emit: Emit) {
  const itemRefs = ref<HTMLButtonElement[]>([])

  const selectedIndex = computed(() =>
    props.options.findIndex((option) => option.value === props.modelValue),
  )
  /** Куда попадает Tab: выбранный сегмент или первый, если ничего не выбрано */
  const tabIndexOf = (index: number) =>
    index === (selectedIndex.value === -1 ? 0 : selectedIndex.value) ? 0 : -1

  function accessibleLabel(option: UiSegmentedOption): string | undefined {
    return option.title ? `${option.label}, ${option.title}` : undefined
  }

  function select(index: number, moveFocus = false) {
    const option = props.options[index]
    if (!option || props.disabled) return
    if (option.value !== props.modelValue) emit('update:modelValue', option.value)
    if (moveFocus) {
      nextTick(() => {
        const el = itemRefs.value[index]
        el?.focus()
        el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
    }
  }

  function onKeydown(event: KeyboardEvent) {
    const count = props.options.length
    if (!count) return
    const current = selectedIndex.value === -1 ? 0 : selectedIndex.value
    let next: number | null = null
    const step = KEY_STEP[event.key]
    if (step !== undefined) next = (current + step + count) % count
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = count - 1
    if (next === null) return
    event.preventDefault()
    select(next, true)
  }

  return { itemRefs, tabIndexOf, accessibleLabel, select, onKeydown }
}
