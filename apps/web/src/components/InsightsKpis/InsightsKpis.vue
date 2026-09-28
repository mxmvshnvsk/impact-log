<template>
  <section class="insights-kpis" :aria-label="t('insights.kpi.label')">
    <UiCard v-for="item in items" :key="item.key" as="article" class="insights-kpis__card">
      <div class="insights-kpis__head">
        <span class="insights-kpis__icon"><component :is="item.icon" :size="16" aria-hidden="true" /></span>
        <h3 class="insights-kpis__label">{{ t(`insights.kpi.items.${item.key}`) }}</h3>
      </div>
      <p class="insights-kpis__value">{{ item.value }}</p>
      <p v-if="item.hint" class="insights-kpis__hint">{{ item.hint }}</p>
      <p
        class="insights-kpis__delta"
        :class="item.delta ? `insights-kpis__delta--${item.delta.direction}` : 'insights-kpis__delta--none'"
        :title="previousLabel"
      >
        <template v-if="item.delta">
          <TrendingUp v-if="item.delta.direction === 'up'" :size="14" aria-hidden="true" />
          <TrendingDown v-else-if="item.delta.direction === 'down'" :size="14" aria-hidden="true" />
          <Minus v-else :size="14" aria-hidden="true" />
          <span aria-hidden="true">{{ item.delta.text }}</span>
          <span class="sr-only">{{ item.delta.sr }}</span>
        </template>
        <span v-else>{{ t('insights.kpi.noCompare') }}</span>
      </p>
    </UiCard>
  </section>
</template>

<script setup lang="ts">
import { Minus, TrendingDown, TrendingUp } from 'lucide-vue-next'
import { UiCard } from '@/ui/UiCard'
import { type InsightsKpisProps, useInsightsKpis } from './useInsightsKpis'

const props = defineProps<InsightsKpisProps>()
const { t, items, previousLabel } = useInsightsKpis(props)
</script>

<style scoped src="./InsightsKpis.css"></style>
