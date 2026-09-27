<template>
  <div class="dashboard">
    <header class="dashboard__header">
      <UiEyebrow>{{ t('dashboard.eyebrow') }}</UiEyebrow>
      <h1 class="dashboard__title">{{ t('dashboard.greeting', { login }) }}</h1>
      <p class="dashboard__lead l-content">{{ t('dashboard.lead') }}</p>
    </header>

    <section class="dashboard__stats" :aria-label="t('dashboard.stats.label')">
      <UiCard v-for="stat in stats" :key="stat.key" class="dashboard__stat">
        <span class="dashboard__stat-icon"><component :is="stat.icon" :size="18" aria-hidden="true" /></span>
        <span class="dashboard__stat-label">{{ t(`dashboard.stats.${stat.key}`) }}</span>
        <span class="dashboard__stat-value">—</span>
      </UiCard>
    </section>

    <UiCard class="dashboard__empty" padding="lg">
      <AppMascot class="dashboard__mascot" mood="idle" />
      <div class="dashboard__empty-text">
        <h2 class="dashboard__empty-title">{{ t('dashboard.empty.title') }}</h2>
        <p class="dashboard__empty-lead">{{ t('dashboard.empty.text') }}</p>
        <UiButton disabled>
          <Plus :size="18" aria-hidden="true" />{{ t('dashboard.empty.cta') }}
          <span class="dashboard__soon">{{ t('nav.soon') }}</span>
        </UiButton>
      </div>
    </UiCard>
  </div>
</template>

<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { AppMascot } from '@/components/AppMascot'
import { UiButton } from '@/ui/UiButton'
import { UiCard } from '@/ui/UiCard'
import { UiEyebrow } from '@/ui/UiEyebrow'
import { useDashboardView } from './useDashboardView'

const { t, login, stats } = useDashboardView()
</script>

<style scoped src="./DashboardView.css"></style>
