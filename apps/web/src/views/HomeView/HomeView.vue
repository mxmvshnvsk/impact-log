<template>
  <div class="home">
    <header class="home__header">
      <UiEyebrow>{{ t('home.eyebrow') }}</UiEyebrow>
      <h1 class="home__title">{{ t('home.greeting', { login }) }}</h1>
      <p class="home__lead l-content">{{ t('home.lead') }}</p>
    </header>

    <section class="home__stats" :aria-label="t('home.stats.label')">
      <UiCard v-for="stat in stats" :key="stat.key" class="home__stat">
        <span class="home__stat-icon"><component :is="stat.icon" :size="18" aria-hidden="true" /></span>
        <span class="home__stat-label">{{ t(`home.stats.${stat.key}`) }}</span>
        <span class="home__stat-value">—</span>
      </UiCard>
    </section>

    <UiCard class="home__empty" padding="lg">
      <AppMascot class="home__mascot" mood="idle" />
      <div class="home__empty-text">
        <h2 class="home__empty-title">{{ t('home.empty.title') }}</h2>
        <p class="home__empty-lead">{{ t('home.empty.text') }}</p>
        <UiButton disabled>
          <Plus :size="18" aria-hidden="true" />{{ t('home.empty.cta') }}
          <span class="home__soon">{{ t('nav.soon') }}</span>
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
import { useHomeView } from './useHomeView'

const { t, login, stats } = useHomeView()
</script>

<style scoped src="./HomeView.css"></style>
