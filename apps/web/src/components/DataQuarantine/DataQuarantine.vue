<template>
  <SettingsSection
    v-if="visible"
    class="data-quarantine"
    :title="t('data.quarantine.title')"
    :icon="FileLock2"
    tone="warning"
  >
    <UiAlert v-if="cleared" tone="success">{{ t('data.quarantine.deleted') }}</UiAlert>
    <template v-else>
      <div class="data-quarantine__text">
        <p class="data-quarantine__facts">
          {{ since ? t('data.quarantine.facts', { objects, date: since }) : objects }}
        </p>
        <p>{{ t('data.quarantine.lead') }}</p>
        <p>{{ t('data.quarantine.keep') }}</p>
      </div>
      <div class="data-quarantine__actions">
        <UiButton variant="secondary" size="sm" @click="download">
          <Download :size="16" aria-hidden="true" />{{ t('data.quarantine.download') }}
        </UiButton>
        <UiButton class="data-quarantine__delete" variant="ghost" size="sm" @click="ask">
          <Trash2 :size="16" aria-hidden="true" />{{ t('data.quarantine.delete') }}
        </UiButton>
      </div>
    </template>

    <UiDialog
      :open="open"
      tone="danger"
      :title="t('data.quarantine.dialogTitle')"
      :description="t('data.quarantine.dialogText', { objects })"
      :confirm-label="t('data.quarantine.confirm')"
      :cancel-label="t('data.quarantine.cancel')"
      :loading="busy"
      @confirm="confirm"
      @cancel="cancel"
    >
      <UiAlert v-if="failed" tone="danger">{{ t('data.quarantine.failed') }}</UiAlert>
    </UiDialog>
  </SettingsSection>
</template>

<script setup lang="ts">
import { Download, FileLock2, Trash2 } from 'lucide-vue-next'
import { SettingsSection } from '@/components/SettingsSection'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiDialog } from '@/ui/UiDialog'
import { useDataQuarantine } from './useDataQuarantine'

const { t, visible, objects, since, cleared, open, busy, failed, download, ask, cancel, confirm } =
  useDataQuarantine()
</script>

<style scoped src="./DataQuarantine.css"></style>
