<template>
  <div class="review">
    <header class="review__header">
      <UiEyebrow>{{ t('review.eyebrow') }}</UiEyebrow>
      <h1 class="review__title">{{ t('review.title') }}</h1>
      <p class="review__lead l-content">{{ t('review.lead') }}</p>
    </header>

    <div v-if="state === 'loading'" class="review__loading">
      <UiSpinner :size="28" />
      <span class="sr-only">{{ t('review.loading') }}</span>
    </div>

    <UiAlert v-else-if="state === 'locked'" tone="info">{{ t('review.locked') }}</UiAlert>

    <InsightsEmpty v-else-if="state === 'empty'" :title="t('review.empty.title')" :text="t('review.empty.text')" />

    <div v-else class="review__layout">
      <UiCard as="aside" class="review__settings" :aria-label="t('review.settings.label')">
        <h2 class="review__h2">{{ t('review.settings.label') }}</h2>
        <PeriodPicker v-model="selection" :period="period" :max="today" variant="select" />
        <ReviewSettings
          v-model:preferences="preferences"
          v-model:title="title"
          v-model:report-locale="reportLocale"
        />
        <ReviewPicker v-model:excluded="excluded" :candidates="candidates" />
      </UiCard>

      <div class="review__main">
        <ReviewActions :markdown="markdown" :prompt="prompt" />
        <UiAlert v-if="!selectedCount" tone="info">{{ t('review.noneSelected') }}</UiAlert>
        <ReviewPreview :markdown="markdown" />
      </div>
    </div>

    <!-- Для печати/PDF: только отчёт, без интерфейса (ReviewView.print.css) -->
    <Teleport v-if="state === 'ready'" to="body">
      <div class="review-print" aria-hidden="true">
        <MarkdownView :source="markdown" :heading-offset="0" />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { InsightsEmpty } from '@/components/InsightsEmpty'
import { MarkdownView } from '@/components/MarkdownView'
import { PeriodPicker } from '@/components/PeriodPicker'
import { ReviewActions } from '@/components/ReviewActions'
import { ReviewPicker } from '@/components/ReviewPicker'
import { ReviewPreview } from '@/components/ReviewPreview'
import { ReviewSettings } from '@/components/ReviewSettings'
import { UiAlert } from '@/ui/UiAlert'
import { UiCard } from '@/ui/UiCard'
import { UiEyebrow } from '@/ui/UiEyebrow'
import { UiSpinner } from '@/ui/UiSpinner'
import { useReviewView } from './useReviewView'

const {
  t,
  today,
  selection,
  period,
  preferences,
  title,
  reportLocale,
  excluded,
  candidates,
  selectedCount,
  markdown,
  prompt,
  state,
} = useReviewView()
</script>

<style scoped src="./ReviewView.css"></style>
<style src="./ReviewView.print.css"></style>
