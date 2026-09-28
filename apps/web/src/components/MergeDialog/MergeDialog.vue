<template>
  <UiDialog
    :open="request !== null"
    :title="t('auth.merge.title')"
    :description="description"
    :confirm-label="confirmLabel"
    :cancel-label="t('auth.merge.cancel')"
    :tone="choice === 'wipe' ? 'danger' : 'default'"
    @confirm="confirm"
    @cancel="cancel"
  >
    <fieldset class="merge-dialog">
      <legend class="sr-only">{{ t('auth.merge.legend') }}</legend>
      <label
        v-for="option in options"
        :key="option"
        class="merge-dialog__option"
        :class="{
          'merge-dialog__option--active': choice === option,
          'merge-dialog__option--danger': option === 'wipe',
        }"
      >
        <input v-model="choice" type="radio" name="merge-choice" :value="option" class="merge-dialog__input" />
        <span class="merge-dialog__radio" aria-hidden="true" />
        <span class="merge-dialog__body">
          <span class="merge-dialog__label">{{ label(option) }}</span>
          <span class="merge-dialog__hint">{{ t(`auth.merge.hints.${option}`) }}</span>
        </span>
      </label>
    </fieldset>
  </UiDialog>
</template>

<script setup lang="ts">
import { UiDialog } from '@/ui/UiDialog'
import { type MergeDialogEmits, type MergeDialogProps, useMergeDialog } from './useMergeDialog'

const props = defineProps<MergeDialogProps>()
const emit = defineEmits<MergeDialogEmits>()
const { t, options, choice, description, label, confirmLabel, confirm, cancel } = useMergeDialog(
  props,
  emit,
)
</script>

<style scoped src="./MergeDialog.css"></style>
