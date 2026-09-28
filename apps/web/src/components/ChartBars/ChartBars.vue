<template>
  <div
    ref="root"
    class="chart-bars"
    :class="{ 'chart-bars--has-active': activeRow }"
    tabindex="0"
    role="group"
    :aria-label="navLabel"
    @focus="onFocus"
    @blur="onBlur"
    @keydown="onKeydown"
  >
    <svg
      class="chart-bars__svg"
      role="img"
      :viewBox="`0 0 ${width} ${height}`"
      :width="width"
      :height="height"
      :aria-labelledby="`${uid}-title ${uid}-desc`"
      @pointerleave="onPointerLeave"
    >
      <title :id="`${uid}-title`">{{ title }}</title>
      <desc :id="`${uid}-desc`">{{ description }}</desc>

      <g v-for="row in rows" :key="row.key" aria-hidden="true">
        <text class="chart-bars__label" :x="0" :y="row.labelY">{{ row.text }}</text>
        <line class="chart-bars__track" :x1="0" :x2="0" :y1="row.barY - 2" :y2="row.barY + barHeight + 2" />
        <path
          class="chart-bars__bar"
          :class="[`chart-bars__bar--${row.tone ?? 'accent'}`, { 'chart-bars__bar--active': activeRow?.index === row.index }]"
          :d="row.path"
        />
        <text class="chart-bars__value" :x="row.valueX" :y="row.valueY" dominant-baseline="central">
          {{ row.valueLabel }}
        </text>
        <rect
          class="chart-bars__hit"
          :x="0"
          :y="row.top"
          :width="width"
          :height="barHeight + 24"
          @pointerenter="onPointerEnter(row.index)"
        />
      </g>
    </svg>

    <ChartTooltip
      v-if="owner && activeRow"
      :x="Math.max(activeRow.length, 12)"
      :y="activeRow.barY"
      :width="width"
      :lines="tooltipLines"
    />
    <p class="sr-only" aria-live="polite">{{ liveText }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue'
import { ChartTooltip } from '@/components/ChartTooltip'
import { type ChartBarsProps, useChartBars } from './useChartBars'

const props = defineProps<ChartBarsProps>()
const root = ref<HTMLElement | null>(null)
const uid = useId()
const {
  width,
  height,
  rows,
  barHeight,
  owner,
  activeRow,
  tooltipLines,
  liveText,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  onKeydown,
} = useChartBars(props, root)
</script>

<style scoped src="./ChartBars.css"></style>
