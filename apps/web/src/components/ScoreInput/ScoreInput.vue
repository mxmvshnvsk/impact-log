<template>
  <div class="score-input">
    <span class="score-input__label" aria-hidden="true">{{ label }}</span>
    <UiSegmented
      :model-value="modelValue"
      :options="options"
      :label="label"
      :size="size"
      block
      @update:model-value="emit('update:modelValue', Number($event))"
    />
    <p class="score-input__caption" aria-live="polite">
      <ScoreBadge :score="modelValue" size="sm" />
      <span>{{ caption }}</span>
    </p>
    <details v-if="withGuide" class="score-input__guide">
      <summary class="score-input__guide-summary">{{ t('impacts.scoreGuide.title') }}</summary>
      <p class="score-input__guide-lead">{{ t('impacts.scoreGuide.lead') }}</p>
      <dl class="score-input__guide-list">
        <div v-for="item in guide" :key="item.score" class="score-input__guide-item">
          <dt><span class="score-input__guide-score">{{ item.score }}</span> {{ item.label }}</dt>
          <dd>{{ item.text }}</dd>
        </div>
      </dl>
    </details>
  </div>
</template>

<script setup lang="ts">
import { ScoreBadge } from '@/components/ScoreBadge'
import { UiSegmented } from '@/ui/UiSegmented'
import { useScoreInput } from './useScoreInput'

const props = withDefaults(
  defineProps<{ modelValue: number; label: string; size?: 'sm' | 'md'; withGuide?: boolean }>(),
  { size: 'md', withGuide: true },
)
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
const { t, options, caption, guide } = useScoreInput(props)
</script>

<style scoped src="./ScoreInput.css"></style>
