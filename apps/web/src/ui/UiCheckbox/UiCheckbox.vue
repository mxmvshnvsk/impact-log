<template>
  <label class="ui-checkbox" :class="{ 'ui-checkbox--disabled': disabled }">
    <input
      class="ui-checkbox__input"
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="ui-checkbox__box" aria-hidden="true">
      <Check :size="14" :stroke-width="3" />
    </span>
    <span class="ui-checkbox__label"><slot /></span>
  </label>
</template>

<script setup lang="ts">
import { Check } from 'lucide-vue-next'

defineProps<{ modelValue: boolean; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<style scoped src="./UiCheckbox.css"></style>
