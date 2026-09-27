<template>
  <article class="principles">
    <header class="principles__hero">
      <UiEyebrow>{{ t('principles.eyebrow') }}</UiEyebrow>
      <h1 class="principles__title">{{ t('principles.title') }}</h1>
      <p class="principles__lead l-content">{{ t('principles.lead') }}</p>
    </header>

    <section class="principles__section" aria-labelledby="values-title">
      <h2 id="values-title" class="principles__h2">{{ t('principles.values.title') }}</h2>
      <div class="principles__grid">
        <UiCard v-for="item in values" :key="item.key" class="principles__value">
          <span class="principles__icon"><component :is="item.icon" :size="20" aria-hidden="true" /></span>
          <h3 class="principles__h3">{{ t(`principles.values.items.${item.key}.title`) }}</h3>
          <p class="principles__text">{{ t(`principles.values.items.${item.key}.text`) }}</p>
        </UiCard>
      </div>
    </section>

    <section class="principles__section" aria-labelledby="stored-title">
      <h2 id="stored-title" class="principles__h2">{{ t('principles.stored.title') }}</h2>
      <p class="principles__section-lead l-content">{{ t('principles.stored.lead') }}</p>
      <UiCard padding="none" class="principles__table">
        <dl>
          <div v-for="key in stored" :key="key" class="principles__row">
            <dt class="principles__row-what">{{ t(`principles.stored.items.${key}.what`) }}</dt>
            <dd class="principles__row-how">{{ t(`principles.stored.items.${key}.how`) }}</dd>
          </div>
        </dl>
      </UiCard>
    </section>

    <section class="principles__section" aria-labelledby="not-title">
      <h2 id="not-title" class="principles__h2">{{ t('principles.notCollected.title') }}</h2>
      <ul class="principles__chips">
        <li v-for="key in notCollected" :key="key" class="principles__chip">
          <Ban :size="14" aria-hidden="true" />{{ t(`principles.notCollected.items.${key}`) }}
        </li>
      </ul>
    </section>

    <section class="principles__section" aria-labelledby="infra-title">
      <h2 id="infra-title" class="principles__h2">{{ t('principles.infra.title') }}</h2>
      <div class="principles__grid">
        <UiCard v-for="item in infra" :key="item.key" variant="muted" class="principles__value">
          <span class="principles__icon"><component :is="item.icon" :size="20" aria-hidden="true" /></span>
          <h3 class="principles__h3">{{ t(`principles.infra.items.${item.key}.title`) }}</h3>
          <p class="principles__text">{{ t(`principles.infra.items.${item.key}.text`) }}</p>
        </UiCard>
      </div>
    </section>

    <section class="principles__section" aria-labelledby="control-title">
      <h2 id="control-title" class="principles__h2">{{ t('principles.control.title') }}</h2>
      <ul class="principles__list l-content">
        <li v-for="item in control" :key="item.key" class="principles__list-item">
          <span class="principles__list-text">{{ t(`principles.control.items.${item.key}`) }}</span>
          <span v-if="item.soon" class="principles__soon">{{ t('nav.soon') }}</span>
        </li>
      </ul>
    </section>

    <p class="principles__updated">{{ t('principles.updated') }}</p>
  </article>
</template>

<script setup lang="ts">
import { Ban } from 'lucide-vue-next'
import { UiCard } from '@/ui/UiCard'
import { UiEyebrow } from '@/ui/UiEyebrow'
import { usePrinciplesView } from './usePrinciplesView'

const { t, values, stored, notCollected, infra, control } = usePrinciplesView()
</script>

<style scoped src="./PrinciplesView.css"></style>
