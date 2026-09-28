<template>
  <div
    class="ui-input"
    :class="{ 'ui-input--error': error, 'ui-input--disabled': disabled, 'ui-input--mono': monospace }"
  >
    <label v-if="label" class="ui-input__label" :class="{ 'sr-only': hideLabel }" :for="id">{{ label }}</label>
    <div class="ui-input__control">
      <input
        :id="id"
        ref="inputRef"
        class="ui-input__field"
        :value="modelValue"
        :type="inputType"
        :name="name"
        :autocomplete="autocomplete"
        :inputmode="inputmode"
        :placeholder="placeholder"
        :maxlength="maxlength"
        :disabled="disabled"
        :autofocus="autofocus"
        :min="min"
        :max="max"
        :enterkeyhint="enterkeyhint"
        :aria-invalid="error ? true : undefined"
        :aria-describedby="describedBy"
        :spellcheck="spellcheck ? 'true' : 'false'"
        :autocapitalize="spellcheck ? undefined : 'off'"
        @input="onInput"
        @focus="emit('focus')"
        @blur="emit('blur')"
      />
      <button
        v-if="revealable"
        type="button"
        class="ui-input__reveal"
        :aria-label="revealed ? t('ui.input.hide') : t('ui.input.show')"
        :aria-pressed="revealed"
        @click="toggleReveal"
      >
        <EyeOff v-if="revealed" :size="18" aria-hidden="true" />
        <Eye v-else :size="18" aria-hidden="true" />
      </button>
    </div>
    <p v-if="error" :id="`${id}-message`" class="ui-input__error" role="alert">
      <CircleAlert :size="14" aria-hidden="true" />{{ error }}
    </p>
    <p v-else-if="hint" :id="`${id}-message`" class="ui-input__hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
import { CircleAlert, Eye, EyeOff } from 'lucide-vue-next'
import { type UiInputEmits, type UiInputProps, useUiInput } from './useUiInput'

const props = withDefaults(defineProps<UiInputProps>(), { type: 'text' })
const emit = defineEmits<UiInputEmits>()
const { t, id, inputRef, inputType, revealed, describedBy, onInput, toggleReveal, focus } =
  useUiInput(props, emit)

defineExpose({ focus })
</script>

<style scoped src="./UiInput.css"></style>
