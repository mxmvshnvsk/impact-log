<template>
  <UiCard class="data-danger" padding="lg" aria-labelledby="data-danger-title">
    <header class="data-danger__header">
      <h2 id="data-danger-title" class="data-danger__title">
        <TriangleAlert :size="20" aria-hidden="true" />{{ t('data.danger.title') }}
      </h2>
      <p class="data-danger__lead">{{ account ? t('data.danger.textSynced') : t('data.danger.text') }}</p>
    </header>

    <UiAlert v-if="account" tone="info">
      {{ t('data.danger.account') }}
      <RouterLink :to="{ name: 'settings-account' }">{{ t('data.danger.accountLink') }}</RouterLink>
    </UiAlert>

    <div>
      <UiButton class="data-danger__erase" variant="danger" @click="start">
        <Trash2 :size="18" aria-hidden="true" />{{ t('data.danger.action') }}
      </UiButton>
    </div>

    <UiDialog
      :open="open"
      tone="danger"
      :title="t('data.danger.dialogTitle')"
      :description="description"
      :confirm-label="t('data.danger.confirm')"
      :cancel-label="t('data.danger.cancel')"
      :loading="busy"
      :confirm-disabled="!matches"
      @confirm="confirm"
      @cancel="cancel"
    >
      <div class="data-danger__dialog">
        <p v-if="account" class="data-danger__note">{{ t('data.danger.accountShort') }}</p>
        <UiButton v-if="count" class="data-danger__backup" variant="secondary" size="sm" @click="backup">
          <Download :size="16" aria-hidden="true" />{{ t('data.danger.backup') }}
        </UiButton>
        <UiInput
          v-model="typed"
          :label="t('data.danger.typeLabel', { word })"
          name="confirm-erase"
          autocomplete="off"
        />
        <UiAlert v-if="failed" tone="danger">{{ t('data.danger.failed') }}</UiAlert>
      </div>
    </UiDialog>
  </UiCard>
</template>

<script setup lang="ts">
import { Download, Trash2, TriangleAlert } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiCard } from '@/ui/UiCard'
import { UiDialog } from '@/ui/UiDialog'
import { UiInput } from '@/ui/UiInput'
import { useDataDanger } from './useDataDanger'

const {
  t,
  account,
  count,
  open,
  typed,
  busy,
  failed,
  word,
  matches,
  description,
  start,
  cancel,
  backup,
  confirm,
} = useDataDanger()
</script>

<style scoped src="./DataDanger.css"></style>
