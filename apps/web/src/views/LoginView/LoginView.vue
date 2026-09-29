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
      <UiAlert v-if="cancelled" tone="info">{{ t('auth.login.cancelled') }}</UiAlert>
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

    <form v-else class="login__form" novalidate @submit.prevent="submitCode()">
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
        <RouterLink :to="{ name: 'recover' }" class="login__link">{{ t('auth.secondFactor.lostPhone') }}</RouterLink>
        <button type="button" class="login__link login__link--muted" :disabled="busy" @click="restart()">
          <ArrowLeft :size="14" aria-hidden="true" />{{ t('auth.secondFactor.back') }}
        </button>
      </div>
    </form>

    <MergeDialog :request="mergeRequest" @choose="answerMerge" />
    <KdfChangeDialog :change="kdfChange" @answer="answerKdf" />

    <template v-if="!alreadySignedIn" #footer>
      {{ t('auth.login.noAccount') }}
      <RouterLink v-if="hasVault" :to="{ name: 'register' }">{{ t('auth.login.enableSync') }}</RouterLink>
      <button v-else-if="!vaultUnavailable" type="button" class="login__footer-button" @click="startLocal">
        {{ t('auth.login.startLocal') }}
      </button>
    </template>
  </AuthCard>
</template>

<script setup lang="ts">
import { ArrowLeft, KeyRound } from 'lucide-vue-next'
import { AuthCard } from '@/components/AuthCard'
import { CryptoProgress } from '@/components/CryptoProgress'
import { KdfChangeDialog } from '@/components/KdfChangeDialog'
import { MergeDialog } from '@/components/MergeDialog'
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
  startLocal,
} = useLoginView()
</script>

<style scoped src="./LoginView.css"></style>
