<template>
  <UiDialog
    :open="change !== null"
    :title="t('auth.kdfChange.title')"
    :description="t('auth.kdfChange.text')"
    :confirm-label="t('auth.kdfChange.confirm')"
    :cancel-label="t('auth.kdfChange.cancel')"
    tone="danger"
    @confirm="proceed"
    @cancel="cancel"
  >
    <div class="kdf-change">
      <ul class="kdf-change__list">
        <li v-for="reason in reasons" :key="reason">{{ reason }}</li>
      </ul>
      <UiAlert tone="warning">{{ t('auth.kdfChange.hint') }}</UiAlert>
    </div>
  </UiDialog>
</template>

<script setup lang="ts">
import { UiAlert } from '@/ui/UiAlert'
import { UiDialog } from '@/ui/UiDialog'
import {
  type KdfChangeDialogEmits,
  type KdfChangeDialogProps,
  useKdfChangeDialog,
} from './useKdfChangeDialog'

const props = defineProps<KdfChangeDialogProps>()
const emit = defineEmits<KdfChangeDialogEmits>()
const { t, reasons, proceed, cancel } = useKdfChangeDialog(props, emit)
</script>

<style scoped src="./KdfChangeDialog.css"></style>
