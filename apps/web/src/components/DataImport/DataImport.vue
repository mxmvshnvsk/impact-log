<template>
  <UiCard class="data-import" padding="lg" aria-labelledby="data-import-title">
    <header class="data-import__header">
      <h2 id="data-import-title" class="data-import__title">{{ t('data.import.title') }}</h2>
      <p class="data-import__lead">{{ t('data.import.lead') }}</p>
    </header>

    <input
      ref="input"
      class="sr-only"
      type="file"
      accept="application/json,.json"
      tabindex="-1"
      aria-hidden="true"
      data-testid="import-file"
      @change="onFile"
    />

    <div v-if="summary" class="data-import__summary" aria-live="polite">
      <p class="data-import__file"><FileJson :size="16" aria-hidden="true" />{{ summary.file }}</p>
      <p>{{ summary.found }}</p>
      <p v-if="summary.invalid" class="data-import__invalid">{{ summary.invalid }}</p>
      <p class="data-import__hint">{{ t('data.import.mergeHint') }}</p>
      <div class="data-import__actions">
        <UiButton :loading="state.step === 'importing'" @click="confirm">
          <Upload :size="18" aria-hidden="true" />{{ t('data.import.confirm') }}
        </UiButton>
        <UiButton variant="ghost" :disabled="state.step === 'importing'" @click="reset">
          {{ t('data.import.cancel') }}
        </UiButton>
      </div>
    </div>

    <template v-else>
      <UiAlert v-if="state.step === 'error'" tone="danger">{{ t(`data.import.errors.${state.reason}`) }}</UiAlert>
      <UiAlert v-if="result" tone="success">
        {{ result.text }}<template v-if="result.invalid"> {{ result.invalid }}</template>
      </UiAlert>
      <div class="data-import__actions">
        <UiButton variant="secondary" @click="choose">
          <FolderOpen :size="18" aria-hidden="true" />{{ t('data.import.choose') }}
        </UiButton>
      </div>
    </template>

    <UiAlert tone="warning">{{ t('data.import.warning') }}</UiAlert>
  </UiCard>
</template>

<script setup lang="ts">
import { FileJson, FolderOpen, Upload } from 'lucide-vue-next'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiCard } from '@/ui/UiCard'
import { useDataImport } from './useDataImport'

const { t, input, state, summary, result, choose, onFile, confirm, reset } = useDataImport()
</script>

<style scoped src="./DataImport.css"></style>
