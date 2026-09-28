<template>
  <UiCard variant="muted" padding="lg" class="insights-locked">
    <span class="insights-locked__icon"><LockKeyhole :size="20" aria-hidden="true" /></span>
    <div class="insights-locked__text">
      <h2 class="insights-locked__title">{{ t('insights.locked.title') }}</h2>
      <p class="insights-locked__lead">{{ t('insights.locked.text') }}</p>
      <ul class="insights-locked__list">
        <li v-for="key in features" :key="key">{{ t(`insights.locked.features.${key}`) }}</li>
      </ul>
    </div>
  </UiCard>
</template>

<script setup lang="ts">
import { LockKeyhole } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { UiCard } from '@/ui/UiCard'

const { t } = useI18n()
const features = ['scores', 'breakdown', 'highlights'] as const
</script>

<style scoped src="./InsightsLocked.css"></style>
