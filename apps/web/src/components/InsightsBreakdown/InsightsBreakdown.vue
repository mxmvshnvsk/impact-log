<template>
  <ChartFrame
    :title="t(`insights.breakdown.${kind}.title`)"
    :subtitle="t(`insights.breakdown.${kind}.subtitle`)"
    :table="table"
  >
    <ChartBars
      v-if="bars.length"
      :data="bars"
      :title="t(`insights.breakdown.${kind}.title`)"
      :description="description"
      :nav-label="t('insights.chart.navY', { chart: t(`insights.breakdown.${kind}.title`) })"
    />
    <p v-else class="insights-breakdown__empty">{{ t(`insights.breakdown.${kind}.empty`) }}</p>
    <template v-if="restText" #footer>{{ restText }}</template>
  </ChartFrame>
</template>

<script setup lang="ts">
import { ChartBars } from '@/components/ChartBars'
import { ChartFrame } from '@/components/ChartFrame'
import { type InsightsBreakdownProps, useInsightsBreakdown } from './useInsightsBreakdown'

const props = defineProps<InsightsBreakdownProps>()
const { t, bars, description, table, restText } = useInsightsBreakdown(props)
</script>

<style scoped src="./InsightsBreakdown.css"></style>
