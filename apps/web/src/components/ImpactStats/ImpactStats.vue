<template>
  <section class="impact-stats" :aria-label="t('dashboard.stats.label')">
    <dl class="impact-stats__grid">
      <div v-for="stat in stats" :key="stat.key" class="impact-stats__item" :title="stat.hint">
        <dt class="impact-stats__label">
          <span class="impact-stats__icon"><component :is="stat.icon" :size="14" aria-hidden="true" /></span>
          {{ t(`dashboard.stats.${stat.key}`) }}
        </dt>
        <dd class="impact-stats__value">{{ stat.value }}</dd>
      </div>
    </dl>
  </section>
</template>

<script setup lang="ts">
import type { Impact } from '@impact-log/core'
import { useImpactStats } from './useImpactStats'

const props = defineProps<{ impacts: readonly Impact[] }>()
const { t, stats } = useImpactStats(props)
</script>

<style scoped src="./ImpactStats.css"></style>
