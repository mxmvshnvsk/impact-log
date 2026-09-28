<template>
  <UiCard class="review-preview" padding="lg" :aria-label="t('review.preview.title')">
    <div class="review-preview__head">
      <h2 class="review-preview__title">{{ t('review.preview.title') }}</h2>
      <UiSegmented v-model="mode" :options="modes" :label="t('review.preview.mode')" size="sm" />
    </div>
    <MarkdownView v-if="mode === 'preview'" class="review-preview__body" :source="markdown" />
    <pre v-else class="review-preview__source"><code>{{ markdown }}</code></pre>
  </UiCard>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MarkdownView } from '@/components/MarkdownView'
import { UiCard } from '@/ui/UiCard'
import { UiSegmented } from '@/ui/UiSegmented'

defineProps<{ markdown: string }>()
const { t } = useI18n()
const mode = ref<string | number>('preview')
const modes = computed(() => [
  { value: 'preview', label: t('review.preview.rendered') },
  { value: 'source', label: t('review.preview.source') },
])
</script>

<style scoped src="./ReviewPreview.css"></style>
