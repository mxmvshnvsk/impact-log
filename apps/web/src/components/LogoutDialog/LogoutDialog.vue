<template>
  <UiDialog
    :open="open"
    :title="t('account.session.dialogTitle', { login })"
    :description="t('account.session.text')"
    :confirm-label="wipe ? t('account.session.wipe') : t('account.session.logout')"
    :cancel-label="t('account.security.cancel')"
    :tone="wipe ? 'danger' : 'default'"
    :loading="busy"
    @confirm="confirm"
    @cancel="close"
  >
    <div class="logout-dialog">
      <div class="logout-dialog__option">
        <UiCheckbox v-model="wipe" :disabled="busy">{{ t('account.session.wipeOption') }}</UiCheckbox>
        <p class="logout-dialog__hint">
          {{ wipe ? t('account.session.wipeHint') : t('account.session.keepHint') }}
        </p>
      </div>
      <UiAlert v-if="wipe && pending > 0" tone="warning">
        {{ t('account.session.pending', { count: pending }) }}
      </UiAlert>
      <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
    </div>
  </UiDialog>
</template>

<script setup lang="ts">
import { UiAlert } from '@/ui/UiAlert'
import { UiCheckbox } from '@/ui/UiCheckbox'
import { UiDialog } from '@/ui/UiDialog'
import { type LogoutDialogEmits, useLogoutDialog } from './useLogoutDialog'

const props = defineProps<{ open: boolean; initialWipe?: boolean }>()
const emit = defineEmits<LogoutDialogEmits>()
const { t, login, wipe, busy, error, pending, confirm, close } = useLogoutDialog(props, emit)
</script>

<style scoped src="./LogoutDialog.css"></style>
