<template>
  <span
    class="score-badge"
    :class="[`score-badge--${size}`, { 'score-badge--high': high }]"
    role="img"
    :aria-label="ariaLabel"
    :title="showLabel ? undefined : ariaLabel"
  >
    <span class="score-badge__bars" aria-hidden="true">
      <span
        v-for="n in max"
        :key="n"
        class="score-badge__bar"
        :class="{ 'score-badge__bar--on': n <= value }"
      />
    </span>
    <span class="score-badge__value" aria-hidden="true">{{ value }}</span>
    <span v-if="showLabel" class="score-badge__label" aria-hidden="true">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { useScoreBadge } from './useScoreBadge'

const props = withDefaults(
  defineProps<{
    score: number
    /** Показать подпись шкалы рядом («Сильное влияние») */
    showLabel?: boolean
    size?: 'sm' | 'md'
  }>(),
  { size: 'md' },
)
const { value, max, high, label, ariaLabel } = useScoreBadge(props)
</script>

<style scoped src="./ScoreBadge.css"></style>
