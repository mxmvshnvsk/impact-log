<template>
  <div class="security-form">
    <form v-if="!enrollment" class="security-form" novalidate @submit.prevent="start">
      <input type="hidden" name="username" autocomplete="username" :value="login" />
      <UiInput
        v-model="password"
        type="password"
        name="current-password"
        autocomplete="current-password"
        revealable
        autofocus
        :label="t('auth.fields.currentPassword')"
        :error="passwordError"
        :disabled="busy"
      />
      <UiOtpInput
        ref="currentCodeRef"
        v-model="currentCode"
        :label="t('account.security.totp.currentCode')"
        :error="currentCodeError"
        :disabled="busy"
      />
      <p class="security-form__hint">{{ t('account.security.totp.lostPhone') }}</p>
      <CryptoProgress v-if="busy" :stage="stage" />
      <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
      <div class="security-form__actions">
        <UiButton type="submit" :loading="busy">{{ t('account.security.totp.start') }}</UiButton>
        <UiButton variant="ghost" :disabled="busy" @click="emit('cancel')">
          {{ t('account.security.cancel') }}
        </UiButton>
      </div>
    </form>
    <template v-else>
      <TotpEnroll
        ref="totpRef"
        v-model:code="code"
        :enrollment="enrollment"
        :submitting="busy"
        :error="codeError"
        @submit="confirm"
      >
        <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
      </TotpEnroll>
      <div class="security-form__actions">
        <UiButton variant="ghost" :disabled="busy" @click="emit('cancel')">
          {{ t('account.security.cancel') }}
        </UiButton>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { CryptoProgress } from '@/components/CryptoProgress'
import { TotpEnroll } from '@/components/TotpEnroll'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiInput } from '@/ui/UiInput'
import { UiOtpInput } from '@/ui/UiOtpInput'
import { type TotpRotationEmits, useTotpRotation } from './useTotpRotation'

const emit = defineEmits<TotpRotationEmits>()
const {
  t,
  login,
  password,
  passwordError,
  currentCode,
  currentCodeError,
  currentCodeRef,
  busy,
  stage,
  error,
  start,
  enrollment,
  code,
  codeError,
  totpRef,
  confirm,
} = useTotpRotation(emit)
</script>

<style scoped src="../SecurityPanel/SecurityForm.css"></style>
