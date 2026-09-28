<template>
  <div
    ref="root"
    class="chart-score"
    tabindex="0"
    role="group"
    :aria-label="navLabel"
    @focus="onFocus"
    @blur="onBlur"
    @keydown="onKeydown"
  >
    <svg
      class="chart-score__svg"
      role="img"
      :viewBox="`0 0 ${width} ${height}`"
      :width="width"
      :height="height"
      :aria-labelledby="`${uid}-title ${uid}-desc`"
      @pointerleave="onPointerLeave"
    >
      <title :id="`${uid}-title`">{{ title }}</title>
      <desc :id="`${uid}-desc`">{{ description }}</desc>

      <g class="chart-score__grid" aria-hidden="true">
        <g v-for="line in gridLines" :key="line.value">
          <line :x1="margin.left" :x2="width - margin.right" :y1="line.y" :y2="line.y" />
          <text class="chart-score__tick" :x="margin.left - 8" :y="line.y" text-anchor="end" dominant-baseline="central">
            {{ line.value }}
          </text>
        </g>
        <line
          v-if="referenceY !== null"
          class="chart-score__reference"
          :x1="margin.left"
          :x2="width - margin.right"
          :y1="referenceY"
          :y2="referenceY"
        />
      </g>

      <g aria-hidden="true">
        <line
          v-if="activePoint"
          class="chart-score__crosshair"
          :x1="activePoint.x"
          :x2="activePoint.x"
          :y1="margin.top"
          :y2="height - margin.bottom"
        />
        <path v-for="(d, index) in segments" :key="index" class="chart-score__line" :d="d" />
        <template v-for="point in points" :key="point.key">
          <circle
            v-if="point.y !== null"
            class="chart-score__dot"
            :class="{ 'chart-score__dot--active': activePoint?.index === point.index }"
            :cx="point.x"
            :cy="point.y"
            :r="activePoint?.index === point.index ? radius + 1.5 : radius"
          />
        </template>
      </g>

      <g aria-hidden="true">
        <rect
          v-for="point in points"
          :key="point.key"
          class="chart-score__hit"
          :x="point.hitX"
          :y="0"
          :width="layout.band"
          :height="height"
          @pointerenter="onPointerEnter(point.index)"
        />
      </g>
    </svg>

    <ChartTooltip
      v-if="owner && activePoint"
      :x="activePoint.x"
      :y="activePoint.y ?? height / 2"
      :width="width"
      :lines="activePoint.tooltip"
    />
    <p class="sr-only" aria-live="polite">{{ liveText }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue'
import { ChartTooltip } from '@/components/ChartTooltip'
import { type ChartScoreLineProps, useChartScoreLine } from './useChartScoreLine'

const props = withDefaults(defineProps<ChartScoreLineProps>(), {
  height: 112,
  active: null,
  reference: null,
})
const emit = defineEmits<{ 'update:active': [value: number | null] }>()
const root = ref<HTMLElement | null>(null)
const uid = useId()
const {
  width,
  height,
  margin,
  layout,
  points,
  segments,
  gridLines,
  referenceY,
  radius,
  owner,
  activePoint,
  liveText,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  onKeydown,
} = useChartScoreLine(props, emit, root)
</script>

<style scoped src="./ChartScoreLine.css"></style>
