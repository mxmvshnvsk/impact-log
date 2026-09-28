<template>
  <div class="period-picker">
    <div class="period-picker__controls">
      <UiSelect
        v-if="useSelect"
        class="period-picker__select"
        :model-value="choice"
        :options="options"
        :label="t('insights.period.label')"
        @update:model-value="onChoice"
      />
      <UiSegmented
        v-else
        :model-value="choice"
        :options="options"
        :label="t('insights.period.label')"
        size="sm"
        @update:model-value="onChoice"
      />
      <div v-if="custom" class="period-picker__range">
        <label class="period-picker__date">
          <span class="period-picker__date-label">{{ t('insights.period.from') }}</span>
          <input
            class="period-picker__date-field"
            type="date"
            :value="custom.from"
            :max="max"
            required
            @change="onDate('from', $event)"
          />
        </label>
        <label class="period-picker__date">
          <span class="period-picker__date-label">{{ t('insights.period.to') }}</span>
          <input
            class="period-picker__date-field"
            type="date"
            :value="custom.to"
            :min="custom.from"
            :max="max"
            required
            @change="onDate('to', $event)"
          />
        </label>
      </div>
    </div>
    <p class="period-picker__caption" aria-live="polite">
      <CalendarRange :size="14" aria-hidden="true" />{{ caption }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { CalendarRange } from 'lucide-vue-next'
import { UiSegmented } from '@/ui/UiSegmented'
import { UiSelect } from '@/ui/UiSelect'
import { type PeriodPickerProps, usePeriodPicker } from './usePeriodPicker'

const props = withDefaults(defineProps<PeriodPickerProps>(), { variant: 'auto' })
const emit = defineEmits<{ 'update:modelValue': [value: PeriodPickerProps['modelValue']] }>()
const { t, useSelect, options, choice, onChoice, custom, onDate, caption } = usePeriodPicker(
  props,
  emit,
)
</script>

<style scoped src="./PeriodPicker.css"></style>
