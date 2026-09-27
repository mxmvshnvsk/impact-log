<template>
  <AuthCard
    :mascot="mascot"
    :eyebrow="step === 'credentials' ? t('auth.login.eyebrow') : t('auth.secondFactor.eyebrow')"
    :title="step === 'credentials' ? t('auth.login.title') : t('auth.secondFactor.title')"
    :subtitle="
      step === 'credentials'
        ? t('auth.login.subtitle')
        : method === 'totp'
          ? t('auth.secondFactor.subtitleTotp')
          : t('auth.secondFactor.subtitleRecovery')
    "
  >
    <form
      v-if="step === 'credentials'"
      class="login__form"
      novalidate
      @submit.prevent="submitCredentials"
    >
      <UiInput
        v-model="credentials.values.login"
        name="username"
        autocomplete="username"
        :label="t('auth.fields.login')"
        :error="credentials.fieldError('login')"
        autofocus
        @focus="mascot.focus('login')"
        @blur="onBlur('login')"
      />
      <UiInput
        v-model="credentials.values.password"
        type="password"
        name="password"
        autocomplete="current-password"
        revealable
        :label="t('auth.fields.password')"
        :error="credentials.fieldError('password')"
        @focus="mascot.focus('password')"
        @blur="onBlur('password')"
        @reveal="mascot.reveal"
      />
      <UiAlert v-if="expired" tone="warning">{{ t('errors.SESSION_EXPIRED') }}</UiAlert>
      <UiAlert v-if="credentials.formError" tone="danger">
        {{ t(`errors.${credentials.formError}`) }}
      </UiAlert>
      <UiButton type="submit" size="lg" block :loading="credentials.submitting">
        {{ t('auth.login.submit') }}
      </UiButton>
    </form>

    <form v-else class="login__form" novalidate @submit.prevent="submitSecondFactor">
      <UiOtpInput
        v-if="method === 'totp'"
        ref="otpRef"
        v-model="code"
        :label="t('auth.fields.totp')"
        :error="codeError"
        autofocus
        @focus="mascot.focus('secret')"
        @blur="mascot.blur()"
        @complete="submitSecondFactor"
      />
      <UiInput
        v-else
        v-model="code"
        monospace
        name="recovery-code"
        autocomplete="off"
        placeholder="xxxx-xxxx-xxxx"
        :label="t('auth.fields.recoveryCode')"
        :error="codeError"
        autofocus
        @focus="mascot.focus('secret')"
        @blur="mascot.blur()"
      />
      <div class="login__remember">
        <UiCheckbox v-model="remember">{{ t('auth.secondFactor.remember') }}</UiCheckbox>
        <p class="login__remember-hint">{{ t('auth.secondFactor.rememberHint') }}</p>
      </div>
      <UiButton type="submit" size="lg" block :loading="verifying">
        {{ t('auth.secondFactor.submit') }}
      </UiButton>
      <div class="login__links">
        <button type="button" class="login__link" @click="toggleMethod">
          {{ method === 'totp' ? t('auth.secondFactor.useRecovery') : t('auth.secondFactor.useTotp') }}
        </button>
        <button type="button" class="login__link login__link--muted" @click="restart">
          <ArrowLeft :size="14" aria-hidden="true" />{{ t('auth.secondFactor.back') }}
        </button>
      </div>
    </form>

    <template #footer>
      {{ t('auth.login.noAccount') }}
      <RouterLink :to="{ name: 'register' }">{{ t('auth.register.cta') }}</RouterLink>
    </template>
  </AuthCard>
</template>

<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'
import { AuthCard } from '@/components/AuthCard'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiCheckbox } from '@/ui/UiCheckbox'
import { UiInput } from '@/ui/UiInput'
import { UiOtpInput } from '@/ui/UiOtpInput'
import { useLoginView } from './useLoginView'

const {
  t,
  mascot,
  step,
  credentials,
  expired,
  onBlur,
  submitCredentials,
  method,
  code,
  remember,
  codeError,
  verifying,
  otpRef,
  submitSecondFactor,
  toggleMethod,
  restart,
} = useLoginView()
</script>

<style scoped src="./LoginView.css"></style>
