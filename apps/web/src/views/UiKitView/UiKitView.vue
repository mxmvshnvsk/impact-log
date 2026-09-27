<template>
  <div class="ui-kit">
    <h1>UI kit</h1>

    <section class="ui-kit__section">
      <h2>Buttons</h2>
      <div class="ui-kit__row">
        <UiButton>Primary</UiButton>
        <UiButton variant="secondary">Secondary</UiButton>
        <UiButton variant="ghost">Ghost</UiButton>
        <UiButton variant="danger">Danger</UiButton>
        <UiButton loading>Loading</UiButton>
        <UiButton disabled>Disabled</UiButton>
        <UiButton size="sm">Small</UiButton>
        <UiButton size="lg">Large</UiButton>
      </div>
    </section>

    <section class="ui-kit__section ui-kit__form">
      <h2>Inputs</h2>
      <UiInput v-model="text" label="Login" hint="3–32 characters" />
      <UiInput v-model="text" label="With error" error="Too short" />
      <UiInput v-model="secret" label="Password" type="password" revealable />
      <UiOtpInput v-model="otp" label="Code" />
      <UiCheckbox v-model="checked">I saved the codes</UiCheckbox>
    </section>

    <section class="ui-kit__section">
      <h2>Feedback</h2>
      <div class="ui-kit__stack">
        <UiAlert tone="danger">Invalid login or password</UiAlert>
        <UiAlert tone="warning">Save your recovery codes</UiAlert>
        <UiAlert tone="info">Information</UiAlert>
        <UiAlert tone="success">Done</UiAlert>
        <UiProgress :value="2" :max="3" />
        <div class="ui-kit__row"><UiEyebrow>Eyebrow</UiEyebrow><UiEyebrow tone="neutral">Neutral</UiEyebrow></div>
      </div>
    </section>

    <section class="ui-kit__section">
      <h2>Cards</h2>
      <div class="ui-kit__cards">
        <UiCard>Solid card</UiCard>
        <UiCard variant="muted">Muted card</UiCard>
        <UiCard variant="glass">Glass card</UiCard>
      </div>
    </section>

    <section class="ui-kit__section">
      <h2>Mascot</h2>
      <div class="ui-kit__mascots">
        <figure v-for="mood in moods" :key="mood" class="ui-kit__mascot">
          <AppMascot :mood="mood" :look="mood === 'watching' ? 0.8 : 0" />
          <figcaption>{{ mood }}</figcaption>
        </figure>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { AppMascot } from '@/components/AppMascot'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiCard } from '@/ui/UiCard'
import { UiCheckbox } from '@/ui/UiCheckbox'
import { UiEyebrow } from '@/ui/UiEyebrow'
import { UiInput } from '@/ui/UiInput'
import { UiOtpInput } from '@/ui/UiOtpInput'
import { UiProgress } from '@/ui/UiProgress'
import { useUiKitView } from './useUiKitView'

const { text, secret, otp, checked, moods } = useUiKitView()
</script>

<style scoped src="./UiKitView.css"></style>
