<template>
  <UiCard class="data-export" padding="lg" aria-labelledby="data-export-title">
    <header class="data-export__header">
      <h2 id="data-export-title" class="data-export__title">{{ t('data.export.title') }}</h2>
      <p class="data-export__lead">{{ t('data.export.lead') }}</p>
    </header>

    <ul class="data-export__list">
      <li v-for="item in formats" :key="item.format" class="data-export__item">
        <span class="data-export__icon"><component :is="item.icon" :size="18" aria-hidden="true" /></span>
        <div class="data-export__text">
          <h3 class="data-export__name">{{ t(`data.export.formats.${item.format}.title`) }}</h3>
          <p class="data-export__hint">{{ t(`data.export.formats.${item.format}.text`) }}</p>
        </div>
        <UiButton
          variant="secondary"
          size="sm"
          class="data-export__button"
          :disabled="!impacts.length"
          @click="download(item.format)"
        >
          <Download :size="16" aria-hidden="true" />{{ t(`data.export.formats.${item.format}.action`) }}
        </UiButton>
      </li>
    </ul>

    <p v-if="!impacts.length" class="data-export__empty">{{ t('data.export.empty') }}</p>
    <UiAlert tone="warning">{{ t('data.export.warning') }}</UiAlert>
    <p class="sr-only" role="status">{{ done ? t('data.export.started') : '' }}</p>
  </UiCard>
</template>

<script setup lang="ts">
import { Download } from 'lucide-vue-next'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiCard } from '@/ui/UiCard'
import { type DataExportProps, useDataExport } from './useDataExport'

const props = defineProps<DataExportProps>()
const { t, formats, done, download } = useDataExport(props)
</script>

<style scoped src="./DataExport.css"></style>
