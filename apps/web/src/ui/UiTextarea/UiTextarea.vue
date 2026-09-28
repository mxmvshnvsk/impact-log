<template>
  <div
    class="ui-textarea"
    :class="{
      'ui-textarea--error': error,
      'ui-textarea--disabled': disabled,
      'ui-textarea--autoresize': autoresize,
      'ui-textarea--mono': monospace,
    }"
  >
    <div class="ui-textarea__head" :class="{ 'sr-only': hideLabel && !counter }">
      <label class="ui-textarea__label" :class="{ 'sr-only': hideLabel }" :for="fieldId">{{ label }}</label>
      <span
        v-if="counter && maxlength"
        class="ui-textarea__counter"
        :class="{ 'ui-textarea__counter--near': nearLimit }"
        aria-hidden="true"
      >{{ length }} / {{ maxlength }}</span>
    </div>
    <textarea
      :id="fieldId"
      ref="fieldRef"
      class="ui-textarea__field"
      :value="modelValue"
      :name="name"
      :rows="rows"
      :maxlength="maxlength"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="describedBy"
      @input="onInput"
      @focus="emit('focus')"
      @blur="emit('blur')"
      @keydown="emit('keydown', $event)"
    />
    <p v-if="error" :id="`${fieldId}-message`" class="ui-textarea__error" role="alert">
      <CircleAlert :size="14" aria-hidden="true" />{{ error }}
    </p>
    <p v-else-if="hint" :id="`${fieldId}-message`" class="ui-textarea__hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
import { CircleAlert } from 'lucide-vue-next'
import { type UiTextareaEmits, type UiTextareaProps, useUiTextarea } from './useUiTextarea'

const props = withDefaults(defineProps<UiTextareaProps>(), { rows: 3 })
const emit = defineEmits<UiTextareaEmits>()
const { fieldId, fieldRef, describedBy, length, nearLimit, onInput, focus, resize } = useUiTextarea(
  props,
  emit,
)

defineExpose({ focus, resize, el: fieldRef })
</script>

<style scoped src="./UiTextarea.css"></style>
