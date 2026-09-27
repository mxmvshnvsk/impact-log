<template>
  <UiCard class="entry-preview" variant="glass">
    <div class="entry-preview__meta">
      <span class="entry-preview__date">{{ date }}</span>
      <span class="entry-preview__project">{{ project }}</span>
    </div>
    <p class="entry-preview__title">{{ title }}</p>
    <p class="entry-preview__impact">
      <TrendingUp :size="16" aria-hidden="true" />{{ impact }}
    </p>
    <ul class="entry-preview__tags">
      <li v-for="tag in tags" :key="tag">#{{ tag }}</li>
    </ul>
  </UiCard>
</template>

<script setup lang="ts">
import { TrendingUp } from 'lucide-vue-next'
import { UiCard } from '@/ui/UiCard'

/** Карточка записи — пока как пример на посадочной, потом станет элементом ленты */
defineProps<{
  date: string
  project: string
  title: string
  impact: string
  tags: readonly string[]
}>()
</script>

<style scoped src="./EntryPreview.css"></style>
