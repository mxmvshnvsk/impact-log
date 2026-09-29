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

    <section class="principles__section" aria-labelledby="source-title">
      <UiCard class="principles__callout principles__source">
        <span class="principles__icon"><CodeXml :size="20" aria-hidden="true" /></span>
        <h2 id="source-title" class="principles__h3">{{ t('principles.source.title') }}</h2>
        <p class="principles__text">{{ t('principles.source.text') }}</p>
        <ul class="principles__source-links">
          <li v-for="link in sourceLinks" :key="link.key" class="principles__source-item">
            <a :href="link.href" target="_blank" rel="noopener noreferrer" class="principles__source-link">
              {{ t(`principles.source.links.${link.key}`) }}<ExternalLink :size="14" aria-hidden="true" />
              <span class="sr-only">{{ t('footer.newTab') }}</span>
            </a>
            <code v-if="link.path" class="principles__source-path">{{ link.path }}</code>
          </li>
        </ul>
        <p class="principles__text principles__source-note">{{ t('principles.source.note') }}</p>
      </UiCard>
    </section>

    <section class="principles__section" aria-labelledby="device-title">
      <h2 id="device-title" class="principles__h2">{{ t('principles.device.title') }}</h2>
      <p class="principles__section-lead l-content">{{ t('principles.device.lead') }}</p>
      <UiCard padding="none" class="principles__table">
        <dl>
          <div v-for="key in device" :key="key" class="principles__row">
            <dt class="principles__row-what">{{ t(`principles.device.items.${key}.what`) }}</dt>
            <dd class="principles__row-how">{{ t(`principles.device.items.${key}.how`) }}</dd>
          </div>
        </dl>
      </UiCard>
    </section>

    <section class="principles__section" aria-labelledby="crypto-title">
      <h2 id="crypto-title" class="principles__h2">{{ t('principles.crypto.title') }}</h2>
      <div class="principles__grid principles__grid--two">
        <UiCard v-for="item in crypto" :key="item.key" variant="muted" class="principles__value">
          <span class="principles__icon"><component :is="item.icon" :size="20" aria-hidden="true" /></span>
          <h3 class="principles__h3">{{ t(`principles.crypto.items.${item.key}.title`) }}</h3>
          <p class="principles__text">{{ t(`principles.crypto.items.${item.key}.text`) }}</p>
        </UiCard>
      </div>
    </section>

    <section class="principles__section" aria-labelledby="server-title">
      <h2 id="server-title" class="principles__h2">{{ t('principles.server.title') }}</h2>
      <p class="principles__section-lead l-content">{{ t('principles.server.lead') }}</p>
      <UiCard padding="none" class="principles__table">
        <dl>
          <div v-for="key in server" :key="key" class="principles__row">
            <dt class="principles__row-what">{{ t(`principles.server.items.${key}.what`) }}</dt>
            <dd class="principles__row-how">{{ t(`principles.server.items.${key}.how`) }}</dd>
          </div>
        </dl>
      </UiCard>
    </section>

    <section class="principles__section" aria-labelledby="never-title">
      <h2 id="never-title" class="principles__h2">{{ t('principles.never.title') }}</h2>
      <ul class="principles__chips">
        <li v-for="key in never" :key="key" class="principles__chip principles__chip--safe">
          <EyeOff :size="14" aria-hidden="true" />{{ t(`principles.never.items.${key}`) }}
        </li>
      </ul>
    </section>

    <section class="principles__section" aria-labelledby="recovery-title">
      <UiCard class="principles__callout">
        <span class="principles__icon"><KeyRound :size="20" aria-hidden="true" /></span>
        <h2 id="recovery-title" class="principles__h3">{{ t('principles.recovery.title') }}</h2>
        <p class="principles__text">{{ t('principles.recovery.text') }}</p>
        <UiAlert tone="warning">{{ t('principles.recovery.warning') }}</UiAlert>
      </UiCard>
    </section>

    <section class="principles__section" aria-labelledby="capture-title">
      <h2 id="capture-title" class="principles__h2">{{ t('principles.capture.title') }}</h2>
      <p class="principles__section-lead principles__section-lead--flat l-content">
        {{ t('principles.capture.text') }}
      </p>
    </section>

    <section class="principles__section" aria-labelledby="limits-title">
      <h2 id="limits-title" class="principles__h2">{{ t('principles.limits.title') }}</h2>
      <ul class="principles__list l-content">
        <li v-for="key in limits" :key="key" class="principles__list-item">
          <span class="principles__list-text">{{ t(`principles.limits.items.${key}`) }}</span>
        </li>
      </ul>
    </section>

    <section class="principles__section" aria-labelledby="cookies-title">
      <h2 id="cookies-title" class="principles__h2">{{ t('principles.cookies.title') }}</h2>
      <p class="principles__section-lead l-content">{{ t('principles.cookies.lead') }}</p>
      <UiCard padding="none" class="principles__table">
        <dl>
          <div v-for="key in cookies" :key="key" class="principles__row">
            <dt class="principles__row-what principles__row-what--mono">
              {{ t(`principles.cookies.items.${key}.what`) }}
            </dt>
            <dd class="principles__row-how">{{ t(`principles.cookies.items.${key}.how`) }}</dd>
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
      <div class="principles__grid principles__grid--two">
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
import { Ban, CodeXml, ExternalLink, EyeOff, KeyRound } from 'lucide-vue-next'
import { UiAlert } from '@/ui/UiAlert'
import { UiCard } from '@/ui/UiCard'
import { UiEyebrow } from '@/ui/UiEyebrow'
import { usePrinciplesView } from './usePrinciplesView'

const {
  t,
  values,
  sourceLinks,
  device,
  crypto,
  server,
  never,
  limits,
  cookies,
  notCollected,
  infra,
  control,
} = usePrinciplesView()
</script>

<style scoped src="./PrinciplesView.css"></style>
