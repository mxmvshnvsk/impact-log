<template>
  <AuthCard :mascot="mascot" :eyebrow="eyebrow" :title="title" :subtitle="subtitle">
    <UiProgress class="register__progress" :value="stepIndex + 1" :max="3" :label="eyebrow" />

    <!-- шаг 1: логин и пароль -->
    <form v-if="step === 'credentials'" class="register__form" novalidate @submit.prevent="submitCredentials">
      <UiInput
        v-model="form.values.login"
        name="username"
        autocomplete="username"
        :label="t('auth.fields.login')"
        :hint="t('auth.register.loginHint')"
        :error="form.fieldError('login')"
        :maxlength="32"
        autofocus
        @focus="mascot.focus('login')"
        @blur="onBlur('login')"
      />
      <UiInput
        v-model="form.values.password"
        type="password"
        name="new-password"
        autocomplete="new-password"
        revealable
        :label="t('auth.fields.password')"
        :hint="t('auth.register.passwordHint')"
        :error="form.fieldError('password')"
        @focus="mascot.focus('password')"
        @blur="onBlur('password')"
        @reveal="mascot.reveal"
      />
      <UiInput
        v-model="form.values.passwordConfirm"
        type="password"
        name="new-password-confirm"
        autocomplete="new-password"
        revealable
        :label="t('auth.fields.passwordConfirm')"
        :error="form.fieldError('passwordConfirm')"
        @focus="mascot.focus('password')"
        @blur="onBlur('passwordConfirm')"
        @reveal="mascot.reveal"
      />
      <UiAlert v-if="form.formError" tone="danger">{{ t(`errors.${form.formError}`) }}</UiAlert>
      <UiButton type="submit" size="lg" block :loading="form.submitting">
        {{ t('auth.register.next') }}<ArrowRight :size="18" aria-hidden="true" />
      </UiButton>
    </form>

    <!-- шаг 2: подключение приложения-аутентификатора -->
    <form v-else-if="step === 'totp'" class="register__form" novalidate @submit.prevent="submitCode">
      <ol class="register__steps">
        <li>{{ t('auth.totp.step1') }}</li>
        <li>{{ t('auth.totp.step2') }}</li>
      </ol>
      <div class="register__qr">
        <img v-if="qrDataUrl" :src="qrDataUrl" :alt="t('auth.totp.qrAlt')" width="184" height="184" />
      </div>
      <div class="register__secret">
        <span class="register__secret-label">{{ t('auth.totp.manual') }}</span>
        <code class="register__secret-value">{{ enrollment?.secret }}</code>
        <UiButton size="sm" variant="secondary" @click="copySecret">
          <Check v-if="secretCopied" :size="16" aria-hidden="true" />
          <Copy v-else :size="16" aria-hidden="true" />
          {{ secretCopied ? t('common.copied') : t('common.copy') }}
        </UiButton>
      </div>
      <UiOtpInput
        ref="otpRef"
        v-model="code"
        :label="t('auth.totp.codeLabel')"
        :error="codeError"
        @focus="mascot.focus('secret')"
        @blur="mascot.blur()"
        @complete="submitCode"
      />
      <UiButton type="submit" size="lg" block :loading="confirming">
        {{ t('auth.totp.submit') }}
      </UiButton>
    </form>

    <!-- шаг 3: резервные коды -->
    <div v-else class="register__form">
      <UiAlert tone="warning">{{ t('auth.recovery.warning') }}</UiAlert>
      <ul class="register__codes">
        <li v-for="item in recoveryCodes" :key="item"><code>{{ item }}</code></li>
      </ul>
      <div class="register__codes-actions">
        <UiButton size="sm" variant="secondary" @click="copyCodes">
          <Check v-if="codesCopied" :size="16" aria-hidden="true" />
          <Copy v-else :size="16" aria-hidden="true" />
          {{ codesCopied ? t('common.copied') : t('auth.recovery.copy') }}
        </UiButton>
        <UiButton size="sm" variant="secondary" @click="downloadCodes">
          <Download :size="16" aria-hidden="true" />{{ t('auth.recovery.download') }}
        </UiButton>
      </div>
      <UiCheckbox v-model="codesSaved">{{ t('auth.recovery.confirm') }}</UiCheckbox>
      <UiButton size="lg" block :disabled="!codesSaved" @click="finish">
        {{ t('auth.recovery.finish') }}<ArrowRight :size="18" aria-hidden="true" />
      </UiButton>
    </div>

    <template v-if="step === 'credentials'" #footer>
      {{ t('auth.register.haveAccount') }}
      <RouterLink :to="{ name: 'login' }">{{ t('auth.login.title') }}</RouterLink>
      ·
      <RouterLink :to="{ name: 'principles' }">{{ t('auth.register.howWeStore') }}</RouterLink>
    </template>
  </AuthCard>
</template>

<script setup lang="ts">
import { ArrowRight, Check, Copy, Download } from 'lucide-vue-next'
import { AuthCard } from '@/components/AuthCard'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiCheckbox } from '@/ui/UiCheckbox'
import { UiInput } from '@/ui/UiInput'
import { UiOtpInput } from '@/ui/UiOtpInput'
import { UiProgress } from '@/ui/UiProgress'
import { useRegisterView } from './useRegisterView'

const {
  t,
  mascot,
  step,
  stepIndex,
  eyebrow,
  title,
  subtitle,
  form,
  onBlur,
  submitCredentials,
  enrollment,
  qrDataUrl,
  secretCopied,
  copySecret,
  code,
  codeError,
  confirming,
  otpRef,
  submitCode,
  recoveryCodes,
  codesCopied,
  codesSaved,
  copyCodes,
  downloadCodes,
  finish,
} = useRegisterView()
</script>

<style scoped src="./RegisterView.css"></style>
