<template>
  <section class="insights-highlights" aria-labelledby="insights-highlights-title">
    <h2 id="insights-highlights-title" class="insights-highlights__title">{{ t('insights.highlights.title') }}</h2>
    <div class="insights-highlights__grid">
      <UiCard class="insights-highlights__card">
        <h3 class="insights-highlights__h3">{{ t('insights.highlights.top') }}</h3>
        <ol class="insights-highlights__entries">
          <li v-for="entry in entries" :key="entry.id" class="insights-highlights__entry">
            <ScoreBadge :score="entry.score" size="sm" />
            <div class="insights-highlights__entry-body">
              <RouterLink :to="{ name: 'impact', params: { id: entry.id } }" class="insights-highlights__link">
                {{ entry.title }}
              </RouterLink>
              <p class="insights-highlights__meta">
                {{ entry.date }}<template v-if="entry.categories"> · {{ entry.categories }}</template>
              </p>
            </div>
          </li>
        </ol>
      </UiCard>

      <UiCard class="insights-highlights__card">
        <h3 class="insights-highlights__h3">{{ t('insights.highlights.facts') }}</h3>
        <ul v-if="facts.length" class="insights-highlights__facts">
          <li
            v-for="fact in facts"
            :key="fact.key"
            class="insights-highlights__fact"
            :class="`insights-highlights__fact--${fact.tone}`"
          >
            <span class="insights-highlights__fact-icon">
              <component :is="fact.icon" :size="16" aria-hidden="true" />
            </span>
            <span>{{ fact.text }}</span>
          </li>
        </ul>
        <p v-else class="insights-highlights__empty">{{ t('insights.highlights.noFacts') }}</p>
        <p class="insights-highlights__note">{{ t('insights.highlights.note') }}</p>
      </UiCard>
    </div>
  </section>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { ScoreBadge } from '@/components/ScoreBadge'
import { UiCard } from '@/ui/UiCard'
import { type InsightsHighlightsProps, useInsightsHighlights } from './useInsightsHighlights'

const props = defineProps<InsightsHighlightsProps>()
const { t, facts, entries } = useInsightsHighlights(props)
</script>

<style scoped src="./InsightsHighlights.css"></style>
