<template>
  <div class="ui-otp" :class="{ 'ui-otp--error': error, 'ui-otp--focused': focused }">
    <label v-if="label" class="ui-otp__label" :for="id">{{ label }}</label>
    <div class="ui-otp__cells">
      <input
        :id="id"
        ref="inputRef"
        class="ui-otp__input"
        :value="modelValue"
        :maxlength="length"
        :autofocus="autofocus"
        :disabled="disabled"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="error ? `${id}-error` : undefined"
        inputmode="numeric"
        autocomplete="one-time-code"
        pattern="[0-9]*"
        @input="onInput"
        @focus="onFocus"
        @blur="onBlur"
      />
      <span
        v-for="(cell, index) in cells"
        :key="index"
        class="ui-otp__cell"
        :class="{ 'ui-otp__cell--active': focused && index === activeIndex, 'ui-otp__cell--filled': cell }"
        aria-hidden="true"
        >{{ cell }}</span
      >
    </div>
    <p v-if="error" :id="`${id}-error`" class="ui-otp__error" role="alert">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { type UiOtpEmits, type UiOtpProps, useUiOtpInput } from './useUiOtpInput'

const props = withDefaults(defineProps<UiOtpProps>(), { length: 6 })
const emit = defineEmits<UiOtpEmits>()
const { id, inputRef, cells, activeIndex, focused, onInput, onFocus, onBlur, focus } =
  useUiOtpInput(props, emit)

defineExpose({ focus })
</script>

<style scoped src="./UiOtpInput.css"></style>
