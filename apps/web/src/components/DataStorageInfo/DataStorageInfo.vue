<template>
  <UiCard variant="muted" class="data-storage" aria-labelledby="data-storage-title">
    <span class="data-storage__icon"><HardDrive :size="20" aria-hidden="true" /></span>
    <div class="data-storage__text">
      <h2 id="data-storage-title" class="data-storage__title">{{ t('data.storage.title') }}</h2>
      <p>{{ t('data.storage.text') }}</p>
      <p v-if="facts" class="data-storage__facts">{{ facts }}</p>
      <RouterLink :to="{ name: 'principles' }" class="data-storage__link">
        {{ t('data.storage.principles') }}<ArrowRight :size="14" aria-hidden="true" />
      </RouterLink>
    </div>
  </UiCard>
</template>

<script setup lang="ts">
import { ArrowRight, HardDrive } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useLocale } from '@/composables/useLocale'
import { UiCard } from '@/ui/UiCard'
import { formatDate, plural } from '@/utils/insightsFormat'

const props = defineProps<{ count: number; createdAt?: string | null }>()
const { t } = useI18n()
const { locale } = useLocale()

const facts = computed(() => {
  const entries = plural(t, locale.value, 'insights.units.entries', props.count)
  return props.createdAt
    ? t('data.storage.facts', {
        entries,
        date: formatDate(locale.value, props.createdAt.slice(0, 10)),
      })
    : entries
})
</script>

<style scoped src="./DataStorageInfo.css"></style>
