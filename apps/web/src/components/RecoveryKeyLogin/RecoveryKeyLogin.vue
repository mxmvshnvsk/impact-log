<template>
  <form v-if="phase === 'key'" class="key-login" novalidate @submit.prevent="submitKey">
    <UiInput
      ref="keyRef"
      v-model="recoveryKey"
      monospace
      name="recovery-key"
      autocomplete="off"
      placeholder="ILRK1-XXXX-XXXX-…"
      autofocus
      :label="t('auth.fields.recoveryKey')"
      :hint="t('auth.recover.keyHint')"
      :error="keyError"
      :disabled="busy"
      @focus="mascot.focus('secret')"
      @blur="onKeyBlur"
    />
    <UiAlert tone="warning">{{ t('auth.recoveryLogin.warning') }}</UiAlert>
    <CryptoProgress v-if="busy" :stage="stage" />
    <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
    <UiButton type="submit" size="lg" block :loading="busy">{{ t('auth.recoveryLogin.submit') }}</UiButton>
    <button type="button" class="key-login__link" :disabled="busy" @click="back">
      <ArrowLeft :size="14" aria-hidden="true" />{{ t('auth.recoveryLogin.back') }}
    </button>
  </form>

  <TotpEnroll
    v-else-if="enrollment"
    ref="totpRef"
    v-model:code="code"
    v-model:remember="remember"
    show-remember
    :enrollment="enrollment"
    :submitting="busy"
    :error="codeError"
    :submit-label="t('auth.recoveryLogin.enrollSubmit')"
    @submit="submitCode"
    @focus="mascot.focus('secret')"
    @blur="mascot.blur()"
  >
    <CryptoProgress v-if="busy" :stage="stage" />
    <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
  </TotpEnroll>
</template>

<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'
import { CryptoProgress } from '@/components/CryptoProgress'
import { TotpEnroll } from '@/components/TotpEnroll'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiInput } from '@/ui/UiInput'
import {
  type RecoveryKeyLoginEmits,
  type RecoveryKeyLoginProps,
  useRecoveryKeyLogin,
} from './useRecoveryKeyLogin'

const props = defineProps<RecoveryKeyLoginProps>()
const emit = defineEmits<RecoveryKeyLoginEmits>()
const {
  t,
  phase,
  busy,
  stage,
  error,
  recoveryKey,
  keyError,
  keyRef,
  onKeyBlur,
  submitKey,
  enrollment,
  code,
  codeError,
  remember,
  totpRef,
  submitCode,
  back,
} = useRecoveryKeyLogin(props, emit)
</script>

<style scoped src="./RecoveryKeyLogin.css"></style>
