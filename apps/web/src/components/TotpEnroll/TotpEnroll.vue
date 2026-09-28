<template>
  <form class="totp-enroll" novalidate @submit.prevent="submit">
    <ol class="totp-enroll__steps">
      <li>{{ t('auth.totp.step1') }}</li>
      <li>{{ t('auth.totp.step2') }}</li>
    </ol>
    <div class="totp-enroll__qr">
      <img v-if="qrDataUrl" :src="qrDataUrl" :alt="t('auth.totp.qrAlt')" width="184" height="184" />
    </div>
    <div class="totp-enroll__secret">
      <span class="totp-enroll__secret-label">{{ t('auth.totp.manual') }}</span>
      <code class="totp-enroll__secret-value" translate="no">{{ enrollment.secret }}</code>
      <UiButton size="sm" variant="secondary" @click="copySecret">
        <Check v-if="copied" :size="16" aria-hidden="true" />
        <Copy v-else :size="16" aria-hidden="true" />
        {{ copied ? t('auth.recoveryKit.copied') : t('auth.recoveryKit.copy') }}
      </UiButton>
    </div>
    <UiOtpInput
      ref="otpRef"
      v-model="code"
      :label="t('auth.totp.codeLabel')"
      :error="error"
      @focus="emit('focus')"
      @blur="emit('blur')"
      @complete="submit"
    />
    <div v-if="showRemember" class="totp-enroll__remember">
      <UiCheckbox v-model="remember">{{ t('auth.secondFactor.remember') }}</UiCheckbox>
      <p class="totp-enroll__remember-hint">{{ t('auth.secondFactor.rememberHint') }}</p>
    </div>
    <slot />
    <UiButton type="submit" size="lg" block :loading="submitting">
      {{ submitLabel ?? t('auth.totp.submit') }}
    </UiButton>
  </form>
</template>

<script setup lang="ts">
import { Check, Copy } from 'lucide-vue-next'
import { UiButton } from '@/ui/UiButton'
import { UiCheckbox } from '@/ui/UiCheckbox'
import { UiOtpInput } from '@/ui/UiOtpInput'
import { type TotpEnrollEmits, type TotpEnrollProps, useTotpEnroll } from './useTotpEnroll'

const props = defineProps<TotpEnrollProps>()
const emit = defineEmits<TotpEnrollEmits>()
const code = defineModel<string>('code', { required: true })
const remember = defineModel<boolean>('remember', { default: false })
const { t, qrDataUrl, copied, copySecret, otpRef, submit, focus } = useTotpEnroll(props, emit, code)

defineExpose({ focus })
</script>

<style scoped src="./TotpEnroll.css"></style>
