<template>
  <ChartFrame :title="t('insights.timeline.title')" :subtitle="subtitle" :table="table">
    <ChartColumns
      v-model:active="active"
      :data="columns"
      :title="t('insights.timeline.title')"
      :description="description"
      :nav-label="t('insights.chart.navX', { chart: t('insights.timeline.title') })"
      :height="210"
    />
    <div class="insights-timeline__score">
      <div class="insights-timeline__score-head">
        <h4 class="insights-timeline__score-title">{{ t('insights.timeline.scoreTitle') }}</h4>
        <p v-if="averageText" class="insights-timeline__score-average">
          <span class="insights-timeline__key" aria-hidden="true" />{{ averageText }}
        </p>
      </div>
      <ChartScoreLine
        v-model:active="active"
        :data="scores"
        :title="t('insights.timeline.scoreTitle')"
        :description="scoreDescription"
        :nav-label="t('insights.chart.navX', { chart: t('insights.timeline.scoreTitle') })"
        :reference="averageScore"
      />
    </div>
    <template v-if="hasPartial" #footer>{{ t('insights.timeline.partialNote') }}</template>
  </ChartFrame>
</template>

<script setup lang="ts">
import { ChartColumns } from '@/components/ChartColumns'
import { ChartFrame } from '@/components/ChartFrame'
import { ChartScoreLine } from '@/components/ChartScoreLine'
import { type InsightsTimelineProps, useInsightsTimeline } from './useInsightsTimeline'

const props = defineProps<InsightsTimelineProps>()
const {
  t,
  active,
  columns,
  scores,
  hasPartial,
  subtitle,
  description,
  averageText,
  scoreDescription,
  table,
} = useInsightsTimeline(props)
</script>

<style scoped src="./InsightsTimeline.css"></style>
