<template>
  <form class="security-form" novalidate @submit.prevent="submit">
    <input type="hidden" name="username" autocomplete="username" :value="login" />
    <UiInput
      ref="currentRef"
      v-model="form.values.current"
      type="password"
      name="current-password"
      autocomplete="current-password"
      revealable
      autofocus
      :label="t('auth.fields.currentPassword')"
      :error="currentError ?? form.fieldError('current')"
      :disabled="busy"
      @blur="form.onBlur('current')"
    />
    <UiInput
      v-model="form.values.password"
      type="password"
      name="new-password"
      autocomplete="new-password"
      revealable
      :label="t('auth.fields.newPassword')"
      :hint="t('auth.register.passwordHint')"
      :error="form.fieldError('password')"
      :disabled="busy"
      @blur="form.onBlur('password')"
    />
    <UiInput
      v-model="form.values.passwordConfirm"
      type="password"
      name="new-password-confirm"
      autocomplete="new-password"
      revealable
      :label="t('auth.fields.passwordConfirm')"
      :error="form.fieldError('passwordConfirm')"
      :disabled="busy"
      @blur="form.onBlur('passwordConfirm')"
    />
    <CryptoProgress v-if="busy" :stage="stage" />
    <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
    <div class="security-form__actions">
      <UiButton type="submit" :loading="busy">{{ t('account.security.password.submit') }}</UiButton>
      <UiButton variant="ghost" :disabled="busy" @click="emit('cancel')">
        {{ t('account.security.cancel') }}
      </UiButton>
    </div>
  </form>
</template>

<script setup lang="ts">
import { CryptoProgress } from '@/components/CryptoProgress'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiInput } from '@/ui/UiInput'
import { type ChangePasswordEmits, useChangePasswordForm } from './useChangePasswordForm'

const emit = defineEmits<ChangePasswordEmits>()
const { t, login, form, busy, stage, error, currentError, currentRef, submit } =
  useChangePasswordForm(emit)
</script>

<style scoped src="../SecurityPanel/SecurityForm.css"></style>
