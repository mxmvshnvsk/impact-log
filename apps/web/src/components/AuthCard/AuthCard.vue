<template>
  <div class="auth-card">
    <AppMascot
      class="auth-card__mascot"
      :mood="mascot.mood"
      :look="mascot.look"
      :action="mascot.action"
      :message="mascot.message"
    />
    <UiCard class="auth-card__panel" padding="lg">
      <header class="auth-card__header">
        <UiEyebrow v-if="eyebrow">{{ eyebrow }}</UiEyebrow>
        <h1 class="auth-card__title">{{ title }}</h1>
        <p v-if="subtitle" class="auth-card__subtitle">{{ subtitle }}</p>
      </header>
      <slot />
    </UiCard>
    <p v-if="$slots.footer" class="auth-card__footer"><slot name="footer" /></p>
  </div>
</template>

<script setup lang="ts">
import { AppMascot } from '@/components/AppMascot'
import type { MascotView } from '@/composables/useMascot'
import { UiCard } from '@/ui/UiCard'
import { UiEyebrow } from '@/ui/UiEyebrow'

defineProps<{
  /** Состояние маскота (reactive(useMascot())) */
  mascot: MascotView
  title: string
  subtitle?: string
  eyebrow?: string
}>()
</script>

<style scoped src="./AuthCard.css"></style>
