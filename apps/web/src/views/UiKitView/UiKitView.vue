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

    <section class="ui-kit__section ui-kit__form">
      <h2>Textarea · Select</h2>
      <UiTextarea v-model="longText" label="Description" hint="Markdown" :maxlength="300" counter autoresize />
      <UiTextarea v-model="longText" label="With error" error="Too long" :rows="2" />
      <UiSelect v-model="period" label="Period" :options="periodOptions" hint="Native select" />
    </section>

    <section class="ui-kit__section">
      <h2>Segmented · Chips</h2>
      <div class="ui-kit__stack">
        <UiSegmented v-model="segment" label="Mode" :options="segmentOptions" />
        <UiSegmented :model-value="score" label="Score" size="sm" :options="scoreOptions" @update:model-value="score = Number($event)" />
        <div class="ui-kit__row">
          <UiChip>neutral</UiChip>
          <UiChip tone="accent">accent</UiChip>
          <UiChip removable remove-label="Remove perf">#perf</UiChip>
          <UiChip tone="accent" size="sm" :to="{ name: 'ui-kit' }">link</UiChip>
        </div>
        <ChipsInput v-model="chips" label="Labels" :suggestions="['perf', 'ci', 'frontend', 'hiring']" hint="Enter or comma" />
      </div>
    </section>

    <section class="ui-kit__section">
      <h2>Score</h2>
      <div class="ui-kit__row">
        <ScoreBadge v-for="n in 5" :key="n" :score="n" />
        <ScoreBadge :score="4" show-label />
      </div>
      <div class="ui-kit__stack">
        <ScoreInput v-model="score" label="Impact" />
      </div>
    </section>

    <section class="ui-kit__section">
      <h2>Markdown · Dialog</h2>
      <UiCard class="ui-kit__markdown"><MarkdownView :source="markdown" /></UiCard>
      <div class="ui-kit__row">
        <UiButton variant="secondary" @click="dialog = 'default'">Open dialog</UiButton>
        <UiButton variant="danger" @click="dialog = 'danger'">Open danger dialog</UiButton>
      </div>
      <UiDialog
        :open="dialog !== null"
        title="Delete this entry?"
        description="You can bring it back right after deleting."
        confirm-label="Delete"
        cancel-label="Cancel"
        :tone="dialog === 'danger' ? 'danger' : 'default'"
        @confirm="dialog = null"
        @cancel="dialog = null"
      />
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
import { ChipsInput } from '@/components/ChipsInput'
import { MarkdownView } from '@/components/MarkdownView'
import { ScoreBadge } from '@/components/ScoreBadge'
import { ScoreInput } from '@/components/ScoreInput'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiCard } from '@/ui/UiCard'
import { UiCheckbox } from '@/ui/UiCheckbox'
import { UiChip } from '@/ui/UiChip'
import { UiDialog } from '@/ui/UiDialog'
import { UiEyebrow } from '@/ui/UiEyebrow'
import { UiInput } from '@/ui/UiInput'
import { UiOtpInput } from '@/ui/UiOtpInput'
import { UiProgress } from '@/ui/UiProgress'
import { UiSegmented } from '@/ui/UiSegmented'
import { UiSelect } from '@/ui/UiSelect'
import { UiTextarea } from '@/ui/UiTextarea'
import { useUiKitView } from './useUiKitView'

const kit = useUiKitView()
const { text, secret, otp, checked, moods, longText, period, periodOptions } = kit
const { segment, segmentOptions, score, scoreOptions, chips, markdown, dialog } = kit
</script>

<style scoped src="./UiKitView.css"></style>
