<template>
  <ChartFrame :title="t('insights.scores.title')" :subtitle="subtitle" :table="table">
    <ChartBars
      :data="bars"
      :title="t('insights.scores.title')"
      :description="description"
      :nav-label="t('insights.chart.navY', { chart: t('insights.scores.title') })"
    />
    <template #footer>
      <span class="insights-scores__legend">
        <span class="insights-scores__swatch insights-scores__swatch--accent" aria-hidden="true" />{{ t('insights.scores.legendHigh') }}
      </span>
      <span class="insights-scores__legend">
        <span class="insights-scores__swatch insights-scores__swatch--muted" aria-hidden="true" />{{ t('insights.scores.legendRest') }}
      </span>
    </template>
  </ChartFrame>
</template>

<script setup lang="ts">
import type { ImpactSummary } from '@impact-log/core'
import { ChartBars } from '@/components/ChartBars'
import { ChartFrame } from '@/components/ChartFrame'
import { useInsightsScores } from './useInsightsScores'

const props = defineProps<{ summary: ImpactSummary }>()
const { t, bars, subtitle, description, table } = useInsightsScores(props)
</script>

<style scoped src="./InsightsScores.css"></style>
