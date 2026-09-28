<template>
  <div class="insights">
    <header class="insights__header">
      <UiEyebrow>{{ t('insights.eyebrow') }}</UiEyebrow>
      <h1 class="insights__title">{{ t('insights.title') }}</h1>
      <p class="insights__lead l-content">{{ t('insights.lead') }}</p>
    </header>

    <div v-if="state === 'loading'" class="insights__loading">
      <UiSpinner :size="28" />
      <span class="sr-only">{{ t('insights.loading') }}</span>
    </div>

    <InsightsEmpty
      v-else-if="state === 'empty'"
      :title="t('insights.empty.title')"
      :text="t('insights.empty.text')"
    />

    <template v-else>
      <div class="insights__toolbar">
        <PeriodPicker v-model="selection" :period="period" :max="today" />
      </div>

      <InsightsKpis
        :comparison="comparison"
        :previous-period="previous"
        :streak="streak"
        :comparable="comparable"
      />

      <InsightsEmpty
        v-if="state === 'emptyPeriod'"
        :title="t('insights.emptyPeriod.title')"
        :text="t('insights.emptyPeriod.text')"
        mood="sleeping"
      >
        <UiButton variant="secondary" @click="showAllTime">{{ t('insights.emptyPeriod.showAll') }}</UiButton>
      </InsightsEmpty>

      <template v-else>
        <InsightsTimeline
          :buckets="buckets"
          :granularity="granularity"
          :period="period"
          :total="comparison.current.total"
          :average-score="comparison.current.averageScore"
        />

        <template v-if="advanced">
          <InsightsHighlights :top="top" :observations="observations" />
          <section class="insights__section" aria-labelledby="insights-structure-title">
            <h2 id="insights-structure-title" class="insights__h2">{{ t('insights.structure') }}</h2>
            <div class="insights__grid">
              <InsightsScores :summary="comparison.current" />
              <InsightsBreakdown
                kind="categories"
                :items="comparison.current.categories"
              />
              <InsightsBreakdown
                class="insights__wide"
                kind="labels"
                :items="comparison.current.labels"
              />
            </div>
          </section>
        </template>
        <InsightsLocked v-else />
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { InsightsBreakdown } from '@/components/InsightsBreakdown'
import { InsightsEmpty } from '@/components/InsightsEmpty'
import { InsightsHighlights } from '@/components/InsightsHighlights'
import { InsightsKpis } from '@/components/InsightsKpis'
import { InsightsLocked } from '@/components/InsightsLocked'
import { InsightsScores } from '@/components/InsightsScores'
import { InsightsTimeline } from '@/components/InsightsTimeline'
import { PeriodPicker } from '@/components/PeriodPicker'
import { UiButton } from '@/ui/UiButton'
import { UiEyebrow } from '@/ui/UiEyebrow'
import { UiSpinner } from '@/ui/UiSpinner'
import { useInsightsView } from './useInsightsView'

const {
  t,
  today,
  selection,
  period,
  previous,
  comparison,
  granularity,
  buckets,
  streak,
  comparable,
  observations,
  top,
  advanced,
  state,
  showAllTime,
} = useInsightsView()
</script>

<style scoped src="./InsightsView.css"></style>
