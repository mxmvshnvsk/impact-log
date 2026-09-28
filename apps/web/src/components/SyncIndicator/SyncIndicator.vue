<template>
  <UiIconButton
    v-if="visible"
    class="sync-indicator"
    :class="`sync-indicator--${tone}`"
    :label="label"
    :to="to"
  >
    <component
      :is="icon"
      class="sync-indicator__icon"
      :class="{ 'sync-indicator__icon--spin': spinning }"
      :size="20"
      aria-hidden="true"
    />
    <span v-if="badge" class="sync-indicator__badge" aria-hidden="true">{{ badge }}</span>
  </UiIconButton>
</template>

<script setup lang="ts">
import { UiIconButton } from '@/ui/UiIconButton'
import { useSyncIndicator } from './useSyncIndicator'

const { visible, spinning, icon, tone, label, badge, to } = useSyncIndicator()
</script>

<style scoped src="./SyncIndicator.css"></style>
