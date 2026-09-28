<template>
  <UiCard class="review-actions" :aria-label="t('review.actions.label')">
    <div class="review-actions__buttons">
      <UiButton @click="copyMarkdown">
        <Check v-if="markdownCopied" :size="18" aria-hidden="true" />
        <Copy v-else :size="18" aria-hidden="true" />
        {{ markdownCopied ? t('review.actions.copied') : t('review.actions.copy') }}
      </UiButton>
      <UiButton variant="secondary" @click="download">
        <Download :size="18" aria-hidden="true" />{{ t('review.actions.download') }}
      </UiButton>
      <UiButton variant="secondary" @click="print">
        <Printer :size="18" aria-hidden="true" />{{ t('review.actions.print') }}
      </UiButton>
    </div>

    <div class="review-actions__ai">
      <UiButton variant="ghost" size="sm" class="review-actions__ai-button" @click="copyPrompt">
        <Check v-if="promptCopied" :size="16" aria-hidden="true" />
        <Sparkles v-else :size="16" aria-hidden="true" />
        {{ promptCopied ? t('review.actions.copied') : t('review.actions.prompt') }}
      </UiButton>
      <p class="review-actions__note">
        <ShieldCheck :size="14" aria-hidden="true" />{{ t('review.actions.promptNote') }}
      </p>
    </div>
    <p class="sr-only" role="status">{{ status }}</p>
  </UiCard>
</template>

<script setup lang="ts">
import { Check, Copy, Download, Printer, ShieldCheck, Sparkles } from 'lucide-vue-next'
import { UiButton } from '@/ui/UiButton'
import { UiCard } from '@/ui/UiCard'
import { type ReviewActionsProps, useReviewActions } from './useReviewActions'

const props = defineProps<ReviewActionsProps>()
const { t, markdownCopied, promptCopied, status, copyMarkdown, copyPrompt, download, print } =
  useReviewActions(props)
</script>

<style scoped src="./ReviewActions.css"></style>
