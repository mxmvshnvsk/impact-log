<template>
  <UiCard class="settings-section" :class="`settings-section--${tone}`" padding="lg" :aria-labelledby="titleId">
    <header class="settings-section__header">
      <span v-if="icon" class="settings-section__icon" :class="`settings-section__icon--${tone}`">
        <component :is="icon" :size="20" aria-hidden="true" />
      </span>
      <div class="settings-section__heading">
        <h2 :id="titleId" class="settings-section__title">{{ title }}</h2>
        <p v-if="lead" class="settings-section__lead">{{ lead }}</p>
      </div>
    </header>
    <slot />
  </UiCard>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import { useId } from 'vue'
import { UiCard } from '@/ui/UiCard'

/** Секция страницы настроек: карточка с иконкой, заголовком и пояснением */
withDefaults(
  defineProps<{
    title: string
    lead?: string
    icon?: Component
    tone?: 'neutral' | 'accent' | 'warning' | 'danger'
  }>(),
  { tone: 'neutral' },
)
const titleId = useId()
</script>

<style scoped src="./SettingsSection.css"></style>
