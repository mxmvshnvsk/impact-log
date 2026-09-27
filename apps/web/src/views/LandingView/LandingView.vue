<template>
  <div class="landing">
    <!-- первый экран -->
    <section class="landing__hero">
      <div class="landing__hero-text">
        <UiEyebrow>{{ t('landing.hero.eyebrow') }}</UiEyebrow>
        <h1 class="landing__title">{{ t('landing.hero.title') }}</h1>
        <p class="landing__lead">{{ t('landing.hero.lead') }}</p>
        <div class="landing__actions">
          <template v-if="isAuthenticated">
            <UiButton size="lg" :to="{ name: 'dashboard' }">
              {{ t('nav.openApp') }}<ArrowRight :size="18" aria-hidden="true" />
            </UiButton>
          </template>
          <template v-else>
            <UiButton size="lg" :to="{ name: 'register' }">
              {{ t('landing.cta.start') }}<ArrowRight :size="18" aria-hidden="true" />
            </UiButton>
            <UiButton size="lg" variant="secondary" :to="{ name: 'login' }">
              {{ t('auth.login.title') }}
            </UiButton>
          </template>
        </div>
      </div>
      <div class="landing__hero-visual" aria-hidden="true">
        <AppMascot
          class="landing__mascot"
          :mood="mascot.mood"
          :action="mascot.action"
          :message="isMobile ? null : mascot.message"
        />
        <div class="landing__entries">
          <EntryPreview
            v-for="(entry, index) in examples"
            :key="index"
            class="landing__entry"
            v-bind="entry"
          />
        </div>
      </div>
    </section>

    <!-- знакомо? -->
    <section class="landing__section" aria-labelledby="pains-title">
      <UiEyebrow tone="neutral">{{ t('landing.pains.eyebrow') }}</UiEyebrow>
      <h2 id="pains-title" class="landing__h2">{{ t('landing.pains.title') }}</h2>
      <div class="landing__grid landing__grid--3">
        <UiCard v-for="key in pains" :key="key" class="landing__card">
          <p class="landing__quote">{{ t(`landing.pains.items.${key}.quote`) }}</p>
          <p class="landing__text">{{ t(`landing.pains.items.${key}.text`) }}</p>
        </UiCard>
      </div>
    </section>

    <!-- как это работает -->
    <section class="landing__section" aria-labelledby="how-title">
      <UiEyebrow>{{ t('landing.how.eyebrow') }}</UiEyebrow>
      <h2 id="how-title" class="landing__h2">{{ t('landing.how.title') }}</h2>
      <ol class="landing__steps">
        <li v-for="(key, index) in steps" :key="key" class="landing__step">
          <span class="landing__step-number">{{ index + 1 }}</span>
          <h3 class="landing__h3">{{ t(`landing.how.steps.${key}.title`) }}</h3>
          <p class="landing__text">{{ t(`landing.how.steps.${key}.text`) }}</p>
        </li>
      </ol>
    </section>

    <!-- что внутри -->
    <section class="landing__section" aria-labelledby="features-title">
      <UiEyebrow>{{ t('landing.features.eyebrow') }}</UiEyebrow>
      <h2 id="features-title" class="landing__h2">{{ t('landing.features.title') }}</h2>
      <div class="landing__grid landing__grid--3">
        <UiCard v-for="item in features" :key="item.key" class="landing__card">
          <span class="landing__icon"><component :is="item.icon" :size="20" aria-hidden="true" /></span>
          <h3 class="landing__h3">
            {{ t(`landing.features.items.${item.key}.title`) }}
            <span v-if="item.soon" class="landing__soon">{{ t('nav.soon') }}</span>
          </h3>
          <p class="landing__text">{{ t(`landing.features.items.${item.key}.text`) }}</p>
        </UiCard>
      </div>
    </section>

    <!-- приватность -->
    <section class="landing__privacy" aria-labelledby="privacy-title">
      <div class="landing__privacy-text">
        <UiEyebrow>{{ t('landing.privacy.eyebrow') }}</UiEyebrow>
        <h2 id="privacy-title" class="landing__h2">{{ t('landing.privacy.title') }}</h2>
        <p class="landing__text">{{ t('landing.privacy.text') }}</p>
        <RouterLink :to="{ name: 'principles' }" class="landing__link">
          {{ t('landing.privacy.link') }}<ArrowRight :size="16" aria-hidden="true" />
        </RouterLink>
      </div>
      <ul class="landing__checks">
        <li v-for="key in privacy" :key="key">
          <Check :size="18" aria-hidden="true" />{{ t(`landing.privacy.items.${key}`) }}
        </li>
      </ul>
    </section>

    <!-- финальный призыв -->
    <section class="landing__final">
      <h2 class="landing__h2">{{ t('landing.final.title') }}</h2>
      <p class="landing__text">{{ t('landing.final.text') }}</p>
      <UiButton v-if="isAuthenticated" size="lg" :to="{ name: 'dashboard' }">
        {{ t('nav.openApp') }}<ArrowRight :size="18" aria-hidden="true" />
      </UiButton>
      <UiButton v-else size="lg" :to="{ name: 'register' }">
        {{ t('landing.cta.start') }}<ArrowRight :size="18" aria-hidden="true" />
      </UiButton>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ArrowRight, Check } from 'lucide-vue-next'
import { AppMascot } from '@/components/AppMascot'
import { EntryPreview } from '@/components/EntryPreview'
import { UiButton } from '@/ui/UiButton'
import { UiCard } from '@/ui/UiCard'
import { UiEyebrow } from '@/ui/UiEyebrow'
import { useLandingView } from './useLandingView'

const { t, isAuthenticated, isMobile, mascot, examples, pains, steps, features, privacy } =
  useLandingView()
</script>

<style scoped src="./LandingView.css"></style>
