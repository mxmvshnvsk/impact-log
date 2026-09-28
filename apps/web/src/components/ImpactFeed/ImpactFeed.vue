<template>
  <div class="impact-feed">
    <section
      v-for="group in groups"
      :key="group.key"
      class="impact-feed__month"
      :aria-labelledby="`month-${group.key}`"
    >
      <h2 :id="`month-${group.key}`" class="impact-feed__title">
        {{ group.title }}
        <span class="impact-feed__count">{{ t('dashboard.feed.count', { n: group.total }, group.total) }}</span>
      </h2>
      <ol class="impact-feed__list">
        <li v-for="impact in group.items" :key="impact.objectId">
          <ImpactCard :impact="impact" :conflict="conflictIds.has(impact.objectId)" />
        </li>
      </ol>
    </section>
    <div v-if="hasMore" ref="sentinelRef" class="impact-feed__more">
      <UiButton variant="secondary" size="sm" @click="showMore">
        {{ t('dashboard.feed.more', { n: remaining }, remaining) }}
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Impact } from '@impact-log/core'
import { ImpactCard } from '@/components/ImpactCard'
import { UiButton } from '@/ui/UiButton'
import { useImpactFeed } from './useImpactFeed'

const props = defineProps<{ impacts: readonly Impact[] }>()
const { t, groups, hasMore, remaining, showMore, sentinelRef, conflictIds } = useImpactFeed(props)
</script>

<style scoped src="./ImpactFeed.css"></style>
