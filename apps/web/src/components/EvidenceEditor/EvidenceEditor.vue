<template>
  <div class="evidence-editor">
    <ul v-if="modelValue.length" class="evidence-editor__list">
      <li v-for="(item, index) in modelValue" :key="item.key" class="evidence-editor__item">
        <span class="evidence-editor__icon"><EvidenceIcon :kind="item.kind" :size="18" /></span>
        <div class="evidence-editor__body">
          <p class="evidence-editor__meta">
            <span class="evidence-editor__kind">{{ t(`impacts.evidence.kinds.${item.kind}`) }}</span>
            <span v-if="item.ref" class="evidence-editor__ref">{{ item.ref }}</span>
            <a
              v-if="safeHref(item.url)"
              class="evidence-editor__url"
              :href="safeHref(item.url) ?? undefined"
              target="_blank"
              rel="noopener noreferrer"
            >{{ shortUrl(item.url) }}</a>
          </p>
          <UiTextarea
            v-if="item.kind === 'text'"
            :model-value="item.excerpt ?? ''"
            :label="t('impacts.evidence.note')"
            hide-label
            :rows="2"
            :maxlength="4000"
            autoresize
            @update:model-value="update(index, { excerpt: $event })"
          />
          <input
            class="evidence-editor__title"
            :value="item.title ?? ''"
            maxlength="300"
            :aria-label="t('impacts.evidence.titleLabel', { n: index + 1 })"
            :placeholder="t('impacts.evidence.titlePlaceholder')"
            @input="update(index, { title: ($event.target as HTMLInputElement).value })"
          />
          <p v-if="error(index)" class="evidence-editor__error" role="alert">{{ error(index) }}</p>
        </div>
        <UiIconButton
          class="evidence-editor__remove"
          :label="t('impacts.evidence.remove', { n: index + 1 })"
          @click="remove(index)"
        >
          <Trash2 :size="18" aria-hidden="true" />
        </UiIconButton>
      </li>
    </ul>
    <div v-if="!full" class="evidence-editor__add">
      <UiInput
        v-model="draft"
        class="evidence-editor__add-field"
        :label="t('impacts.evidence.addLabel')"
        :placeholder="t('impacts.evidence.placeholder')"
        :hint="hint"
        enterkeyhint="done"
        spellcheck
        @keydown="onKeydown"
        @paste="onPaste"
      />
      <UiButton
        class="evidence-editor__add-button"
        variant="secondary"
        :disabled="!preview"
        @click="add"
      >
        <Plus :size="16" aria-hidden="true" />{{ t('impacts.evidence.add') }}
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Plus, Trash2 } from 'lucide-vue-next'
import { EvidenceIcon } from '@/components/EvidenceIcon'
import type { EvidenceRow } from '@/components/ImpactForm/impactFormState'
import { UiButton } from '@/ui/UiButton'
import { UiIconButton } from '@/ui/UiIconButton'
import { UiInput } from '@/ui/UiInput'
import { UiTextarea } from '@/ui/UiTextarea'
import { type EvidenceEditorProps, useEvidenceEditor } from './useEvidenceEditor'

const props = defineProps<EvidenceEditorProps>()
const emit = defineEmits<{ 'update:modelValue': [value: EvidenceRow[]] }>()
const {
  t,
  draft,
  full,
  hint,
  preview,
  add,
  onPaste,
  onKeydown,
  update,
  remove,
  error,
  safeHref,
  shortUrl,
} = useEvidenceEditor(props, emit)
</script>

<style scoped src="./EvidenceEditor.css"></style>
