<template>
  <div class="chips-input" :class="{ 'chips-input--error': error }">
    <label class="chips-input__label" :for="inputId">{{ label }}</label>
    <div class="chips-input__control">
      <div class="chips-input__box" @click.self="focus">
        <ul v-if="modelValue.length" class="chips-input__chips" :aria-label="label">
          <li v-for="(value, index) in modelValue" :key="value">
            <UiChip
              :tone="kind === 'categories' ? 'accent' : 'neutral'"
              removable
              :remove-label="t('impacts.chips.remove', { value: display(value) })"
              @remove="remove(index)"
            >
              {{ display(value) }}
            </UiChip>
          </li>
        </ul>
        <input
          :id="inputId"
          ref="inputRef"
          class="chips-input__field"
          :value="text"
          type="text"
          role="combobox"
          autocomplete="off"
          enterkeyhint="enter"
          :placeholder="full ? t('impacts.chips.full', { max }) : placeholder"
          :disabled="full && !text"
          aria-autocomplete="list"
          :aria-expanded="listOpen"
          :aria-controls="listId"
          :aria-activedescendant="activeId"
          :aria-invalid="error ? true : undefined"
          :aria-describedby="describedBy"
          @input="onInput"
          @keydown="onKeydown"
          @focus="onFocus"
          @blur="onBlur"
        />
      </div>
      <ul v-show="listOpen" :id="listId" class="chips-input__list" role="listbox" :aria-label="label">
        <li
          v-for="(option, index) in filtered"
          :id="`${listId}-${index}`"
          :key="option"
          class="chips-input__option"
          :class="{ 'chips-input__option--active': index === activeIndex }"
          role="option"
          :aria-selected="index === activeIndex"
          @mousedown.prevent="pick(option)"
        >
          {{ display(option) }}
        </li>
      </ul>
    </div>
    <p v-if="error" :id="messageId" class="chips-input__error" role="alert">
      <CircleAlert :size="14" aria-hidden="true" />{{ error }}
    </p>
    <p v-else-if="hint" :id="messageId" class="chips-input__hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
import { CircleAlert } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { UiChip } from '@/ui/UiChip'
import { type ChipsInputEmits, type ChipsInputProps, useChipsInput } from './useChipsInput'

const props = withDefaults(defineProps<ChipsInputProps>(), { kind: 'labels' })
const emit = defineEmits<ChipsInputEmits>()
const { t } = useI18n()
const {
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
} = useChipsInput(props, emit)

defineExpose({ focus })
</script>

<style scoped src="./ChipsInput.css"></style>
