<template>
  <AuthCard :mascot="mascot" :eyebrow="eyebrow" :title="title" :subtitle="subtitle">
    <!-- хранилище уже привязано к аккаунту -->
    <div v-if="alreadyLinked" class="register__form">
      <UiAlert tone="success">{{ t('auth.register.alreadyText', { login: account?.login }) }}</UiAlert>
      <UiButton size="lg" block :to="{ name: 'dashboard' }">{{ t('auth.login.toJournal') }}</UiButton>
      <UiButton size="lg" variant="secondary" block :to="{ name: 'settings-account' }">
        {{ t('auth.login.toSettings') }}
      </UiButton>
    </div>

    <template v-else>
      <UiProgress
        class="register__progress"
        :value="stepIndex + 1"
        :max="steps.length"
        :label="eyebrow"
      />

      <!-- шаг 1: логин и пароль -->
      <form
        v-if="step === 'credentials'"
        class="register__form"
        novalidate
        @submit.prevent="submitCredentials"
      >
        <UiInput
          v-model="form.values.login"
          name="username"
          autocomplete="username"
          :label="t('auth.fields.login')"
          :hint="t('auth.register.loginHint')"
          :error="form.fieldError('login')"
          :maxlength="32"
          :disabled="busy"
          autofocus
          @focus="mascot.focus('login')"
          @blur="onBlur('login')"
        />
        <template v-if="!passwordReady">
          <UiInput
            v-model="form.values.password"
            type="password"
            name="new-password"
            autocomplete="new-password"
            revealable
            :label="t('auth.fields.password')"
            :hint="t('auth.register.passwordHint')"
            :error="form.fieldError('password')"
            :disabled="busy"
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
            :disabled="busy"
            @focus="mascot.focus('password')"
            @blur="onBlur('passwordConfirm')"
            @reveal="mascot.reveal"
          />
        </template>
        <div v-else class="register__password-ready">
          <span><Check :size="16" aria-hidden="true" />{{ t('auth.register.passwordSet') }}</span>
          <button type="button" class="register__link" @click="resetPassword">
            {{ t('auth.register.passwordChange') }}
          </button>
        </div>
        <UiAlert tone="info">{{ t('auth.register.passwordNote') }}</UiAlert>
        <UiAlert v-if="localCount > 0" tone="info">
          {{ t('auth.register.localRecords', { count: localCount }) }}
        </UiAlert>
        <CryptoProgress v-if="busy" :stage="stage" />
        <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
        <UiButton type="submit" size="lg" block :loading="busy">
          {{ t('auth.register.next') }}<ArrowRight :size="18" aria-hidden="true" />
        </UiButton>
      </form>

      <!-- шаг 2: Recovery Kit -->
      <form v-else-if="step === 'kit' && prepared" class="register__form" novalidate @submit.prevent="submitKit">
        <RecoveryKit ref="kitRef" :recovery-key="prepared.recovery.recoveryKey" :login="login" />
        <CryptoProgress v-if="busy" :stage="stage" />
        <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
        <div class="register__actions">
          <UiButton variant="secondary" size="lg" :disabled="busy" @click="back">
            <ArrowLeft :size="18" aria-hidden="true" />{{ t('auth.register.back') }}
          </UiButton>
          <UiButton type="submit" size="lg" class="register__submit" :loading="busy">
            {{ t('auth.register.submit') }}
          </UiButton>
        </div>
      </form>

      <!-- шаг 3: 2FA -->
      <TotpEnroll
        v-else-if="step === 'totp' && enrollment"
        ref="totpRef"
        v-model:code="code"
        v-model:remember="remember"
        :enrollment="enrollment"
        :submitting="busy"
        :error="codeError"
        show-remember
        @submit="submitCode"
        @focus="mascot.focus('secret')"
        @blur="mascot.blur()"
      >
        <CryptoProgress v-if="busy && stage" :stage="stage" />
        <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
      </TotpEnroll>

      <!-- шаг 4: готово -->
      <div v-else-if="step === 'done'" class="register__form">
        <ul class="register__done">
          <li v-for="item in doneItems" :key="item.key">
            <component :is="item.icon" :size="18" aria-hidden="true" />
            <span>{{ t(`auth.register.doneItems.${item.key}`) }}</span>
          </li>
        </ul>
        <UiButton size="lg" block :to="{ name: 'dashboard' }">
          {{ t('auth.register.finish') }}<ArrowRight :size="18" aria-hidden="true" />
        </UiButton>
      </div>
    </template>

    <template v-if="step === 'credentials' && !alreadyLinked" #footer>
      {{ t('auth.register.haveAccount') }}
      <RouterLink :to="{ name: 'login' }">{{ t('auth.register.signIn') }}</RouterLink>
      ·
      <RouterLink :to="{ name: 'principles' }">{{ t('auth.register.howWeStore') }}</RouterLink>
    </template>
  </AuthCard>
</template>

<script setup lang="ts">
import { ArrowLeft, ArrowRight, Check } from 'lucide-vue-next'
import { AuthCard } from '@/components/AuthCard'
import { CryptoProgress } from '@/components/CryptoProgress'
import { RecoveryKit } from '@/components/RecoveryKit'
import { TotpEnroll } from '@/components/TotpEnroll'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiInput } from '@/ui/UiInput'
import { UiProgress } from '@/ui/UiProgress'
import { useRegisterView } from './useRegisterView'

const {
  t,
  mascot,
  account,
  alreadyLinked,
  steps,
  step,
  stepIndex,
  eyebrow,
  title,
  subtitle,
  form,
  onBlur,
  passwordReady,
  resetPassword,
  localCount,
  busy,
  stage,
  error,
  submitCredentials,
  prepared,
  login,
  kitRef,
  back,
  submitKit,
  enrollment,
  code,
  remember,
  codeError,
  totpRef,
  submitCode,
  doneItems,
} = useRegisterView()
</script>

<style scoped src="./RegisterView.css"></style>
