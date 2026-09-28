<template>
  <div class="chart-tooltip" :style="style" aria-hidden="true">
    <strong class="chart-tooltip__value">{{ lines[0] }}</strong>
    <span v-for="(line, index) in lines.slice(1)" :key="index">{{ line }}</span>
  </div>
</template>

<script setup lang="ts">
import { type ChartTooltipProps, useChartTooltip } from './useChartTooltip'

const props = defineProps<ChartTooltipProps>()
const { style } = useChartTooltip(props)
</script>

<style scoped src="./ChartTooltip.css"></style>
