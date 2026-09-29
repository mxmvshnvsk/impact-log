<template>
  <AuthCard :mascot="mascot" :eyebrow="eyebrow" :title="title" :subtitle="subtitle">
    <!-- уже вошли: второй аккаунт на том же хранилище — только через выход -->
    <div v-if="alreadySignedIn" class="login__form">
      <UiAlert tone="success">{{ t('auth.login.alreadyText', { login: account?.login }) }}</UiAlert>
      <UiButton size="lg" block :to="redirectTo">{{ t('auth.login.toJournal') }}</UiButton>
      <UiButton size="lg" variant="secondary" block :to="{ name: 'settings-account' }">
        {{ t('auth.login.toSettings') }}
      </UiButton>
    </div>

    <form
      v-else-if="step === 'credentials'"
      class="login__form"
      novalidate
      @submit.prevent="submitCredentials"
    >
      <UiAlert v-if="mode === 'signed-out'" tone="info">{{ t('auth.login.reauth') }}</UiAlert>
      <UiAlert v-else-if="expired" tone="warning">{{ t('errors.SESSION_EXPIRED') }}</UiAlert>
      <UiAlert v-if="cancelled" tone="info">
        {{ cancelledAfterReset ? t('auth.recoveryLogin.cancelled') : t('auth.login.cancelled') }}
      </UiAlert>
      <UiInput
        v-model="form.values.login"
        name="username"
        autocomplete="username"
        :label="t('auth.fields.login')"
        :error="form.fieldError('login')"
        :disabled="busy"
        :autofocus="!form.values.login"
        @focus="mascot.focus('login')"
        @blur="onBlur('login')"
      />
      <UiInput
        ref="passwordRef"
        v-model="form.values.password"
        type="password"
        name="password"
        autocomplete="current-password"
        revealable
        :label="t('auth.fields.password')"
        :error="form.fieldError('password')"
        :disabled="busy"
        :autofocus="Boolean(form.values.login)"
        @focus="mascot.focus('password')"
        @blur="onBlur('password')"
        @reveal="mascot.reveal"
      />
      <UiAlert v-if="mergeWarning" tone="warning">{{ mergeWarning }}</UiAlert>
      <CryptoProgress v-if="busy" :stage="stage" />
      <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
      <UiButton type="submit" size="lg" block :loading="busy">{{ t('auth.login.submit') }}</UiButton>
      <p class="login__links">
        <span class="login__muted">{{ t('auth.login.forgot') }}</span>
        <RouterLink :to="{ name: 'recover' }" class="login__link">
          <KeyRound :size="14" aria-hidden="true" />{{ t('auth.login.recover') }}
        </RouterLink>
      </p>
    </form>

    <form v-else-if="step === 'second-factor'" class="login__form" novalidate @submit.prevent="submitCode()">
      <UiOtpInput
        ref="otpRef"
        v-model="code"
        :label="t('auth.fields.totp')"
        :error="codeError"
        :disabled="busy"
        autofocus
        @focus="mascot.focus('secret')"
        @blur="mascot.blur()"
        @complete="submitCode"
      />
      <div class="login__remember">
        <UiCheckbox v-model="remember" :disabled="busy">{{ t('auth.secondFactor.remember') }}</UiCheckbox>
        <p class="login__remember-hint">{{ t('auth.secondFactor.rememberHint') }}</p>
      </div>
      <CryptoProgress v-if="busy" :stage="stage" />
      <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
      <UiButton type="submit" size="lg" block :loading="busy">{{ t('auth.secondFactor.submit') }}</UiButton>
      <div class="login__links">
        <button type="button" class="login__link" :disabled="busy" @click="chooseRecoveryKey">
          <KeyRound :size="14" aria-hidden="true" />{{ t('auth.secondFactor.lostPhone') }}
        </button>
        <button type="button" class="login__link login__link--muted" :disabled="busy" @click="restart()">
          <ArrowLeft :size="14" aria-hidden="true" />{{ t('auth.secondFactor.back') }}
        </button>
      </div>
    </form>

    <!-- путь B: пароль верный, телефона нет — Recovery Key вместо кода и новая 2FA -->
    <RecoveryKeyLogin
      v-else-if="step === 'recovery-key' && pending"
      :pending="pending"
      :mascot="mascot"
      @phase="onRecoveryPhase"
      @back="backToCode"
      @expired="onRecoveryExpired"
      @cancelled="onRecoveryCancelled"
      @done="onRecovered"
    />

    <!-- вошли по Recovery Key: им воспользовались — предложить перевыпустить -->
    <div v-else-if="step === 'recovered'" class="login__form">
      <RecoveryKeyReissue
        v-if="currentAuthKey"
        :current-auth-key="currentAuthKey"
        :login="account?.login ?? form.values.login"
        @mood="mascot.react"
      />
      <UiButton size="lg" block @click="finish">
        {{ t('auth.recoveryLogin.continue') }}<ArrowRight :size="18" aria-hidden="true" />
      </UiButton>
    </div>

    <MergeDialog :request="mergeRequest" @choose="answerMerge" />
    <KdfChangeDialog :change="kdfChange" @answer="answerKdf" />

    <template v-if="!alreadySignedIn && step !== 'recovered'" #footer>
      {{ t('auth.login.noAccount') }}
      <RouterLink v-if="hasVault" :to="{ name: 'register' }">{{ t('auth.login.enableSync') }}</RouterLink>
      <button v-else-if="!vaultUnavailable" type="button" class="login__footer-button" @click="startLocal">
        {{ t('auth.login.startLocal') }}
      </button>
    </template>
  </AuthCard>
</template>

<script setup lang="ts">
import { ArrowLeft, ArrowRight, KeyRound } from 'lucide-vue-next'
import { AuthCard } from '@/components/AuthCard'
import { CryptoProgress } from '@/components/CryptoProgress'
import { KdfChangeDialog } from '@/components/KdfChangeDialog'
import { MergeDialog } from '@/components/MergeDialog'
import { RecoveryKeyLogin } from '@/components/RecoveryKeyLogin'
import { RecoveryKeyReissue } from '@/components/RecoveryKeyReissue'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiCheckbox } from '@/ui/UiCheckbox'
import { UiInput } from '@/ui/UiInput'
import { UiOtpInput } from '@/ui/UiOtpInput'
import { useLoginView } from './useLoginView'

const {
  t,
  mascot,
  mode,
  alreadySignedIn,
  account,
  hasVault,
  vaultUnavailable,
  eyebrow,
  title,
  subtitle,
  redirectTo,
  step,
  form,
  expired,
  cancelled,
  cancelledAfterReset,
  busy,
  stage,
  error,
  mergeWarning,
  mergeRequest,
  answerMerge,
  kdfChange,
  answerKdf,
  passwordRef,
  onBlur,
  submitCredentials,
  code,
  remember,
  codeError,
  otpRef,
  submitCode,
  restart,
  pending,
  chooseRecoveryKey,
  onRecoveryPhase,
  backToCode,
  onRecoveryExpired,
  onRecoveryCancelled,
  onRecovered,
  currentAuthKey,
  finish,
  startLocal,
} = useLoginView()
</script>

<style scoped src="./LoginView.css"></style>
