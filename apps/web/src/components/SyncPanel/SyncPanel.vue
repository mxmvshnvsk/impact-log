<template>
  <UiCard class="sync-panel" padding="lg" aria-labelledby="sync-panel-title">
    <header class="sync-panel__header">
      <span class="sync-panel__icon" :class="`sync-panel__icon--${tone}`">
        <component
          :is="icon"
          :size="20"
          aria-hidden="true"
          :class="{ 'sync-panel__spin': status === 'syncing' }"
        />
      </span>
      <div class="sync-panel__heading">
        <h2 id="sync-panel-title" class="sync-panel__title">{{ t('sync.panel.title') }}</h2>
        <p class="sync-panel__status" role="status">{{ statusText }}</p>
      </div>
    </header>

    <p class="sync-panel__lead">{{ t('sync.panel.description') }}</p>

    <p v-if="status === 'off'" class="sync-panel__muted">{{ t('sync.panel.off') }}</p>
    <ul v-else class="sync-panel__facts">
      <li>{{ lastSync }}</li>
      <li>{{ pendingText }}</li>
    </ul>

    <UiAlert v-if="quota" tone="warning">
      <strong class="sync-panel__alert-title">{{ t('sync.quota.title') }}</strong>
      {{ quota.text }} {{ t('sync.quota.hint') }}
      <template v-if="quota.usage"> {{ quota.usage }}</template>
    </UiAlert>

    <!-- «Нужно войти снова» с кнопкой входа показывает страница настроек отдельной карточкой — здесь не дублируем -->
    <UiAlert v-if="status === 'offline'" tone="info">
      {{ t('sync.panel.offline') }}
      <template v-if="retryText"> {{ retryText }}</template>
    </UiAlert>
    <UiAlert v-else-if="errorText && status !== 'signed-out'" :tone="status === 'error' ? 'danger' : 'warning'">
      {{ errorText }}
      <template v-if="status === 'error' && retryText"> {{ retryText }}</template>
    </UiAlert>

    <div v-if="status !== 'off' && status !== 'signed-out'" class="sync-panel__actions">
      <UiButton
        variant="secondary"
        size="sm"
        :loading="spinning"
        :disabled="!canSync"
        @click="syncNow"
      >
        <RefreshCw :size="16" aria-hidden="true" />{{ t('sync.panel.syncNow') }}
      </UiButton>
    </div>
  </UiCard>
</template>

<script setup lang="ts">
import { RefreshCw } from 'lucide-vue-next'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiCard } from '@/ui/UiCard'
import { useSyncPanel } from './useSyncPanel'

const {
  t,
  status,
  statusText,
  icon,
  tone,
  spinning,
  lastSync,
  pendingText,
  retryText,
  errorText,
  quota,
  canSync,
  syncNow,
} = useSyncPanel()
</script>

<style scoped src="./SyncPanel.css"></style>
