<template>
  <SettingsSection :title="t('account.delete.title')" :lead="t('account.delete.text')" :icon="Trash2" tone="danger">
    <div>
      <UiButton variant="danger" @click="openDialog">
        <Trash2 :size="16" aria-hidden="true" />{{ t('account.delete.action') }}
      </UiButton>
    </div>

    <UiDialog
      :open="open"
      tone="danger"
      :title="title"
      :description="t('account.delete.dialogText')"
      :confirm-label="t('account.delete.submit')"
      :cancel-label="t('account.security.cancel')"
      :loading="busy"
      @confirm="confirm"
      @cancel="close"
    >
      <form class="delete-account__form" novalidate @submit.prevent="confirm">
        <input type="hidden" name="username" autocomplete="username" :value="login" />
        <UiInput
          v-model="password"
          type="password"
          name="current-password"
          autocomplete="current-password"
          revealable
          :label="t('auth.fields.currentPassword')"
          :error="passwordError"
          :disabled="busy"
        />
        <UiOtpInput v-model="code" :label="t('auth.fields.totp')" :error="codeError" :disabled="busy" />
        <CryptoProgress v-if="busy" :stage="stage" />
        <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
        <button type="submit" hidden />
      </form>
    </UiDialog>
  </SettingsSection>
</template>

<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import { CryptoProgress } from '@/components/CryptoProgress'
import { SettingsSection } from '@/components/SettingsSection'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiDialog } from '@/ui/UiDialog'
import { UiInput } from '@/ui/UiInput'
import { UiOtpInput } from '@/ui/UiOtpInput'
import { useDeleteAccountPanel } from './useDeleteAccountPanel'

const {
  t,
  login,
  title,
  open,
  openDialog,
  close,
  password,
  passwordError,
  code,
  codeError,
  busy,
  stage,
  error,
  confirm,
} = useDeleteAccountPanel()
</script>

<style scoped src="./DeleteAccountPanel.css"></style>
