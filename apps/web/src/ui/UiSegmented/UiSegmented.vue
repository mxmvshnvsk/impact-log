<template>
  <div
    class="ui-segmented"
    :class="[`ui-segmented--${size}`, { 'ui-segmented--block': block, 'ui-segmented--disabled': disabled }]"
  >
    <div
      class="ui-segmented__track"
      role="radiogroup"
      :aria-label="label"
      :aria-disabled="disabled || undefined"
      @keydown="onKeydown"
    >
      <button
        v-for="(option, index) in options"
        :key="option.value"
        ref="itemRefs"
        type="button"
        role="radio"
        class="ui-segmented__item"
        :class="{ 'ui-segmented__item--active': option.value === modelValue }"
        :aria-checked="option.value === modelValue"
        :aria-label="accessibleLabel(option)"
        :title="option.title"
        :tabindex="tabIndexOf(index)"
        :disabled="disabled"
        @click="select(index)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type UiSegmentedEmits, type UiSegmentedProps, useUiSegmented } from './useUiSegmented'

const props = withDefaults(defineProps<UiSegmentedProps>(), { size: 'md' })
const emit = defineEmits<UiSegmentedEmits>()
const { itemRefs, tabIndexOf, accessibleLabel, select, onKeydown } = useUiSegmented(props, emit)
</script>

<style scoped src="./UiSegmented.css"></style>
