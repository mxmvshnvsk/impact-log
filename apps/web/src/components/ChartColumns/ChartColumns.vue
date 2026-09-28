<template>
  <div
    ref="root"
    class="chart-columns"
    :class="{ 'chart-columns--has-active': activeColumn }"
    tabindex="0"
    role="group"
    :aria-label="navLabel"
    @focus="onFocus"
    @blur="onBlur"
    @keydown="onKeydown"
  >
    <svg
      class="chart-columns__svg"
      role="img"
      :viewBox="`0 0 ${width} ${height}`"
      :width="width"
      :height="height"
      :aria-labelledby="`${uid}-title ${uid}-desc`"
      @pointerleave="onPointerLeave"
    >
      <title :id="`${uid}-title`">{{ title }}</title>
      <desc :id="`${uid}-desc`">{{ description }}</desc>

      <g class="chart-columns__grid" aria-hidden="true">
        <g v-for="line in gridLines" :key="line.value">
          <line
            :class="{ 'chart-columns__baseline': line.value === 0 }"
            :x1="margin.left"
            :x2="width - margin.right"
            :y1="line.y"
            :y2="line.y"
          />
          <text class="chart-columns__tick" :x="margin.left - 8" :y="line.y" text-anchor="end" dominant-baseline="central">
            {{ line.value }}
          </text>
        </g>
      </g>

      <g aria-hidden="true">
        <path
          v-for="column in columns"
          :key="column.key"
          class="chart-columns__bar"
          :class="{
            'chart-columns__bar--partial': column.partial,
            'chart-columns__bar--active': activeColumn?.index === column.index,
          }"
          :d="column.path"
        />
      </g>

      <g class="chart-columns__values" aria-hidden="true">
        <text
          v-for="column in columns.filter((c) => c.value > 0 && (c.index === peakIndex || c.index === activeColumn?.index))"
          :key="column.key"
          class="chart-columns__value"
          :x="column.center"
          :y="column.top - 6"
          text-anchor="middle"
        >
          {{ column.value }}
        </text>
      </g>

      <g class="chart-columns__axis" aria-hidden="true">
        <text
          v-for="label in xLabels"
          :key="label.key"
          class="chart-columns__tick"
          :x="label.x"
          :y="height - 6"
          :text-anchor="label.anchor"
        >
          {{ label.text }}
        </text>
      </g>

      <g aria-hidden="true">
        <rect
          v-for="column in columns"
          :key="column.key"
          class="chart-columns__hit"
          :x="column.hitX"
          :y="0"
          :width="layout.band"
          :height="height"
          @pointerenter="onPointerEnter(column.index)"
        />
      </g>
    </svg>

    <ChartTooltip
      v-if="owner && activeColumn"
      :x="activeColumn.center"
      :y="Math.min(activeColumn.top, layout.baseline - 4)"
      :width="width"
      :lines="activeColumn.tooltip"
    />
    <p class="sr-only" aria-live="polite">{{ liveText }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue'
import { ChartTooltip } from '@/components/ChartTooltip'
import { type ChartColumnsProps, useChartColumns } from './useChartColumns'

const props = withDefaults(defineProps<ChartColumnsProps>(), { height: 200, active: null })
const emit = defineEmits<{ 'update:active': [value: number | null] }>()
const root = ref<HTMLElement | null>(null)
const uid = useId()
const {
  width,
  height,
  margin,
  layout,
  columns,
  peakIndex,
  gridLines,
  xLabels,
  owner,
  activeColumn,
  liveText,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  onKeydown,
} = useChartColumns(props, emit, root)
</script>

<style scoped src="./ChartColumns.css"></style>
