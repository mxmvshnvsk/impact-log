<template>
  <div class="impact-edit l-content">
    <header class="impact-edit__header">
      <RouterLink class="impact-edit__back" :to="editing ? viewRoute : { name: 'dashboard' }">
        <ArrowLeft :size="16" aria-hidden="true" />
        {{ editing ? t('impacts.edit.backToImpact') : t('impacts.edit.backToJournal') }}
      </RouterLink>
      <h1 v-if="!editing || impact || !ready" class="impact-edit__title">{{ heading }}</h1>
    </header>

    <div v-if="!ready || (!initial && (!editing || impact))" class="impact-edit__loading" role="status">
      <UiSpinner :size="24" /><span class="sr-only">{{ t('common.loading') }}</span>
    </div>
    <ImpactMissing v-else-if="editing && !impact" />
    <ImpactForm
      v-else-if="initial"
      :key="formKey"
      ref="formRef"
      :initial="initial"
      :save="save"
      :submit-label="editing ? t('common.save') : t('impacts.edit.create')"
      :deletable="editing"
      @cancel="cancel"
      @delete="deleteOpen = true"
    />

    <UiDialog
      :open="deleteOpen"
      :title="t('impacts.delete.title')"
      :description="t('impacts.delete.text')"
      :confirm-label="t('impacts.delete.confirm')"
      :cancel-label="t('common.cancel')"
      tone="danger"
      :loading="deleting"
      @confirm="confirmDelete"
      @cancel="deleteOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'
import { ImpactForm } from '@/components/ImpactForm'
import { ImpactMissing } from '@/components/ImpactMissing'
import { UiDialog } from '@/ui/UiDialog'
import { UiSpinner } from '@/ui/UiSpinner'
import { useImpactEditView } from './useImpactEditView'

const v = useImpactEditView()
const { t, ready, editing, impact, initial, formKey, formRef, heading, viewRoute } = v
const { deleteOpen, deleting, save, cancel, confirmDelete } = v
</script>

<style scoped src="./ImpactEditView.css"></style>
