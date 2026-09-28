<template>
  <div class="ui-select" :class="{ 'ui-select--disabled': disabled, 'ui-select--sm': size === 'sm' }">
    <label class="ui-select__label" :class="{ 'sr-only': hideLabel }" :for="fieldId">{{ label }}</label>
    <div class="ui-select__control">
      <select
        :id="fieldId"
        class="ui-select__field"
        :value="modelValue"
        :name="name"
        :disabled="disabled"
        :aria-describedby="hint ? `${fieldId}-hint` : undefined"
        @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <ChevronDown class="ui-select__chevron" :size="18" aria-hidden="true" />
    </div>
    <p v-if="hint" :id="`${fieldId}-hint`" class="ui-select__hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { computed, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: readonly { value: string; label: string }[]
    label: string
    id?: string
    name?: string
    hint?: string
    size?: 'sm' | 'md'
    disabled?: boolean
    /** Скрыть подпись визуально (остаётся для скринридеров) */
    hideLabel?: boolean
  }>(),
  { size: 'md' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const generatedId = useId()
const fieldId = computed(() => props.id ?? generatedId)
</script>

<style scoped src="./UiSelect.css"></style>
