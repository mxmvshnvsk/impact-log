<template>
  <form ref="formRef" class="impact-form" novalidate @submit.prevent="submit" @keydown="onFormKeydown">
    <UiCard class="impact-form__section">
      <div class="impact-form__counted">
        <UiInput
          v-model="state.title"
          name="title"
          :label="t('impacts.form.title')"
          :placeholder="t('impacts.form.titlePlaceholder')"
          :hint="t('impacts.form.titleHint')"
          :error="fieldError('title')"
          :maxlength="titleMax"
          autocomplete="off"
          spellcheck
          @blur="onBlur('title')"
        />
        <span
          class="impact-form__counter"
          :class="{ 'impact-form__counter--near': state.title.length > titleMax * 0.9 }"
          aria-hidden="true"
        >{{ state.title.length }} / {{ titleMax }}</span>
      </div>
      <div class="impact-form__meta">
        <UiInput
          v-model="state.occurredAt"
          class="impact-form__date"
          type="date"
          name="occurredAt"
          :label="t('impacts.form.date')"
          :error="fieldError('occurredAt')"
          @blur="onBlur('occurredAt')"
        />
        <ScoreInput v-model="state.impactScore" :label="t('impacts.form.score')" />
      </div>
    </UiCard>

    <UiCard class="impact-form__section">
      <div class="impact-form__head">
        <h2 class="impact-form__h2">{{ t('impacts.form.description') }}</h2>
        <UiSegmented
          v-model="descriptionMode"
          size="sm"
          :label="t('impacts.form.descriptionMode')"
          :options="[
            { value: 'write', label: t('impacts.form.write') },
            { value: 'preview', label: t('impacts.form.preview') },
          ]"
        />
      </div>
      <UiTextarea
        v-show="descriptionMode === 'write'"
        v-model="state.description"
        name="description"
        :label="t('impacts.form.description')"
        hide-label
        :rows="6"
        autoresize
        :maxlength="descriptionMax"
        :placeholder="t('impacts.form.descriptionPlaceholder')"
        :hint="t('impacts.form.descriptionHint')"
        :error="fieldError('description')"
        @blur="onBlur('description')"
      />
      <div v-if="descriptionMode === 'preview'" class="impact-form__preview">
        <MarkdownView v-if="state.description.trim()" :source="state.description" />
        <p v-else class="impact-form__muted">{{ t('impacts.form.previewEmpty') }}</p>
      </div>
    </UiCard>

    <UiCard class="impact-form__section">
      <h2 class="impact-form__h2">{{ t('impacts.form.organize') }}</h2>
      <div class="impact-form__columns">
        <ChipsInput
          v-model="state.categories"
          kind="categories"
          :label="t('impacts.form.categories')"
          :suggestions="vocab.categories"
          :placeholder="t('impacts.form.categoriesPlaceholder')"
          :hint="t('impacts.form.chipsHint')"
          :error="fieldError('categories')"
        />
        <ChipsInput
          v-model="state.labels"
          kind="labels"
          :label="t('impacts.form.labels')"
          :suggestions="vocab.labels"
          :placeholder="t('impacts.form.labelsPlaceholder')"
          :hint="t('impacts.form.chipsHint')"
          :error="fieldError('labels')"
        />
      </div>
    </UiCard>

    <UiCard class="impact-form__section">
      <div class="impact-form__intro">
        <h2 class="impact-form__h2">{{ t('impacts.form.metrics') }}</h2>
        <p class="impact-form__muted">{{ t('impacts.form.metricsLead') }}</p>
      </div>
      <MetricsEditor v-model="state.metrics" :errors="errors" @blur="onBlur" />
    </UiCard>

    <UiCard class="impact-form__section">
      <div class="impact-form__intro">
        <h2 class="impact-form__h2">{{ t('impacts.form.evidence') }}</h2>
        <p class="impact-form__muted">{{ t('impacts.form.evidenceLead') }}</p>
      </div>
      <EvidenceEditor v-model="state.evidence" :errors="errors" />
    </UiCard>

    <div class="impact-form__footer">
      <UiAlert v-if="formError" tone="danger">{{ formError }}</UiAlert>
      <div class="impact-form__actions">
        <UiButton v-if="deletable" class="impact-form__delete" variant="ghost" @click="emit('delete')">
          <Trash2 :size="16" aria-hidden="true" /><span class="impact-form__delete-text">{{ t('common.delete') }}</span>
        </UiButton>
        <span class="impact-form__shortcut">
          <kbd>{{ shortcut }}</kbd> {{ t('impacts.form.shortcutSave') }}
        </span>
        <UiButton variant="secondary" @click="cancel">{{ t('common.cancel') }}</UiButton>
        <UiButton type="submit" :loading="saving">{{ submitLabel }}</UiButton>
      </div>
    </div>

    <UiDialog
      :open="discardOpen"
      :title="t('impacts.form.discard.title')"
      :description="t('impacts.form.discard.text')"
      :confirm-label="t('impacts.form.discard.confirm')"
      :cancel-label="t('impacts.form.discard.cancel')"
      tone="danger"
      @confirm="confirmDiscard"
      @cancel="keepEditing"
    />
  </form>
</template>

<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import { ChipsInput } from '@/components/ChipsInput'
import { EvidenceEditor } from '@/components/EvidenceEditor'
import { MarkdownView } from '@/components/MarkdownView'
import { MetricsEditor } from '@/components/MetricsEditor'
import { ScoreInput } from '@/components/ScoreInput'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiCard } from '@/ui/UiCard'
import { UiDialog } from '@/ui/UiDialog'
import { UiInput } from '@/ui/UiInput'
import { UiSegmented } from '@/ui/UiSegmented'
import { UiTextarea } from '@/ui/UiTextarea'
import { type ImpactFormProps, useImpactForm } from './useImpactForm'

const props = defineProps<ImpactFormProps>()
const emit = defineEmits<{ cancel: []; delete: [] }>()
const form = useImpactForm(props, emit)
const { t, formRef, state, errors, saving, formError, descriptionMode, vocab, discardOpen } = form
const { shortcut, titleMax, descriptionMax, onBlur, fieldError, submit, cancel } = form
const { confirmDiscard, keepEditing, onFormKeydown } = form

defineExpose({ release: form.release, dirty: form.dirty })
</script>

<style scoped src="./ImpactForm.css"></style>
