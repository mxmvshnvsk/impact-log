<template>
  <div class="metrics-editor">
    <p v-if="!modelValue.length" class="metrics-editor__empty">{{ t('impacts.metrics.empty') }}</p>
    <ol v-else class="metrics-editor__rows">
      <li v-for="(row, index) in modelValue" :key="row.key" class="metrics-editor__row">
        <div class="metrics-editor__field metrics-editor__field--label">
          <label :for="fieldId(index, 'label')">{{ t('impacts.metrics.label') }}</label>
          <input
            :id="fieldId(index, 'label')"
            class="metrics-editor__input"
            :class="{ 'metrics-editor__input--error': error(index, 'label') }"
            :value="row.label"
            maxlength="80"
            :placeholder="t('impacts.metrics.labelPlaceholder')"
            :aria-invalid="error(index, 'label') ? true : undefined"
            @input="update(index, 'label', ($event.target as HTMLInputElement).value)"
            @blur="emit('blur', `metrics.${index}.label`)"
          />
        </div>
        <div class="metrics-editor__field metrics-editor__field--baseline">
          <label :for="fieldId(index, 'baseline')">{{ t('impacts.metrics.baseline') }}</label>
          <input
            :id="fieldId(index, 'baseline')"
            class="metrics-editor__input metrics-editor__input--number"
            :class="{ 'metrics-editor__input--error': error(index, 'baseline') }"
            :value="row.baseline"
            inputmode="decimal"
            placeholder="6"
            :aria-invalid="error(index, 'baseline') ? true : undefined"
            @input="update(index, 'baseline', ($event.target as HTMLInputElement).value)"
            @blur="emit('blur', `metrics.${index}.baseline`)"
          />
        </div>
        <span class="metrics-editor__arrow" aria-hidden="true"><ArrowRight :size="16" /></span>
        <div class="metrics-editor__field metrics-editor__field--value">
          <label :for="fieldId(index, 'value')">{{ t('impacts.metrics.value') }}</label>
          <input
            :id="fieldId(index, 'value')"
            class="metrics-editor__input metrics-editor__input--number"
            :class="{ 'metrics-editor__input--error': error(index, 'value') }"
            :value="row.value"
            inputmode="decimal"
            placeholder="2"
            :aria-invalid="error(index, 'value') ? true : undefined"
            @input="update(index, 'value', ($event.target as HTMLInputElement).value)"
            @blur="emit('blur', `metrics.${index}.value`)"
          />
        </div>
        <div class="metrics-editor__field metrics-editor__field--unit">
          <label :for="fieldId(index, 'unit')">{{ t('impacts.metrics.unit') }}</label>
          <input
            :id="fieldId(index, 'unit')"
            class="metrics-editor__input"
            :value="row.unit"
            maxlength="20"
            :placeholder="t('impacts.metrics.unitPlaceholder')"
            @input="update(index, 'unit', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <UiIconButton
          class="metrics-editor__remove"
          :label="t('impacts.metrics.remove', { n: index + 1 })"
          @click="remove(index)"
        >
          <Trash2 :size="18" aria-hidden="true" />
        </UiIconButton>
        <p v-if="error(index, 'label') || error(index, 'baseline') || error(index, 'value')" class="metrics-editor__error" role="alert">
          <CircleAlert :size="14" aria-hidden="true" />
          {{ error(index, 'label') || error(index, 'baseline') || error(index, 'value') }}
        </p>
        <p v-else-if="change(row)" class="metrics-editor__delta">
          <component
            :is="change(row)?.direction === 'down' ? TrendingDown : TrendingUp"
            :size="14"
            aria-hidden="true"
          />
          {{ t('impacts.metrics.delta', { value: change(row)?.text }) }}
        </p>
      </li>
    </ol>
    <UiButton
      v-if="modelValue.length < max"
      class="metrics-editor__add"
      variant="secondary"
      size="sm"
      @click="add"
    >
      <Plus :size="16" aria-hidden="true" />{{ t('impacts.metrics.add') }}
    </UiButton>
  </div>
</template>

<script setup lang="ts">
import { ArrowRight, CircleAlert, Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-vue-next'
import type { MetricRow } from '@/components/ImpactForm/impactFormState'
import { UiButton } from '@/ui/UiButton'
import { UiIconButton } from '@/ui/UiIconButton'
import { type MetricsEditorProps, useMetricsEditor } from './useMetricsEditor'

const props = defineProps<MetricsEditorProps>()
const emit = defineEmits<{
  'update:modelValue': [value: MetricRow[]]
  blur: [path: string]
}>()
const { t, fieldId, error, update, add, remove, change, max } = useMetricsEditor(props, emit)
</script>

<style scoped src="./MetricsEditor.css"></style>
