<template>
  <UiCard class="insights-empty" padding="lg">
    <AppMascot class="insights-empty__mascot" :mood="mood" />
    <div class="insights-empty__text">
      <h2 class="insights-empty__title">{{ title }}</h2>
      <p class="insights-empty__lead">{{ text }}</p>
      <div class="insights-empty__actions">
        <UiButton :to="{ name: 'impact-new' }">
          <Plus :size="18" aria-hidden="true" />{{ t('insights.empty.cta') }}
        </UiButton>
        <slot />
      </div>
    </div>
  </UiCard>
</template>

<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { AppMascot } from '@/components/AppMascot'
import type { MascotMood } from '@/composables/useMascot'
import { UiButton } from '@/ui/UiButton'
import { UiCard } from '@/ui/UiCard'

/** Пустое состояние с маскотом и CTA «Новая запись» — для инсайтов и ревью */
withDefaults(defineProps<{ title: string; text: string; mood?: MascotMood }>(), { mood: 'idle' })
const { t } = useI18n()
</script>

<style scoped src="./InsightsEmpty.css"></style>
