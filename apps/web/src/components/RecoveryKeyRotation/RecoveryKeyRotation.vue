<template>
  <form class="security-form" novalidate @submit.prevent="submit">
    <p v-if="!material && !error" class="security-form__muted" role="status">
      <UiSpinner :size="16" />
    </p>
    <RecoveryKit v-if="material" ref="kitRef" :recovery-key="material.recoveryKey" :login="login" />
    <template v-if="material">
      <input type="hidden" name="username" autocomplete="username" :value="login" />
      <UiInput
        v-model="password"
        type="password"
        name="current-password"
        autocomplete="current-password"
        revealable
        :label="t('account.security.recoveryKey.confirmPassword')"
        :error="passwordError"
        :disabled="busy"
      />
    </template>
    <CryptoProgress v-if="busy" :stage="stage" />
    <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
    <div class="security-form__actions">
      <UiButton v-if="material" type="submit" :loading="busy">
        {{ t('account.security.recoveryKey.submit') }}
      </UiButton>
      <UiButton variant="ghost" :disabled="busy" @click="emit('cancel')">
        {{ t('account.security.cancel') }}
      </UiButton>
    </div>
  </form>
</template>

<script setup lang="ts">
import { CryptoProgress } from '@/components/CryptoProgress'
import { RecoveryKit } from '@/components/RecoveryKit'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiInput } from '@/ui/UiInput'
import { UiSpinner } from '@/ui/UiSpinner'
import { type RecoveryKeyRotationEmits, useRecoveryKeyRotation } from './useRecoveryKeyRotation'

const emit = defineEmits<RecoveryKeyRotationEmits>()
const { t, login, material, kitRef, password, passwordError, busy, stage, error, submit } =
  useRecoveryKeyRotation(emit)
</script>

<style scoped src="../SecurityPanel/SecurityForm.css"></style>
