<template>
  <dialog
    ref="dialogRef"
    class="ui-dialog"
    :class="`ui-dialog--${tone}`"
    :aria-labelledby="titleId"
    :aria-describedby="description ? descriptionId : undefined"
    @cancel="onCancelEvent"
    @close="onClose"
    @click="onClick"
  >
    <div class="ui-dialog__panel">
      <h2 :id="titleId" class="ui-dialog__title">{{ title }}</h2>
      <p v-if="description" :id="descriptionId" class="ui-dialog__description">{{ description }}</p>
      <div v-if="$slots.default" class="ui-dialog__body"><slot /></div>
      <div class="ui-dialog__actions">
        <UiButton variant="secondary" autofocus :disabled="loading" @click="cancel">
          {{ cancelLabel }}
        </UiButton>
        <UiButton
          :variant="tone === 'danger' ? 'danger' : 'primary'"
          :loading="loading"
          :disabled="confirmDisabled"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </UiButton>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { UiButton } from '@/ui/UiButton'
import { type UiDialogEmits, type UiDialogProps, useUiDialog } from './useUiDialog'

const props = withDefaults(defineProps<UiDialogProps>(), { tone: 'default' })
const emit = defineEmits<UiDialogEmits>()
const { dialogRef, titleId, descriptionId, cancel, onCancelEvent, onClose, onClick } = useUiDialog(
  props,
  emit,
)
</script>

<style scoped src="./UiDialog.css"></style>
