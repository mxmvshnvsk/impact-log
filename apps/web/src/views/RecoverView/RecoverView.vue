<template>
  <AuthCard :mascot="mascot" :eyebrow="t('auth.recover.eyebrow')" :title="title" :subtitle="subtitle">
    <!-- шаг 1: логин + Recovery Key -->
    <form v-if="step === 'key'" class="recover__form" novalidate @submit.prevent="submitKey">
      <UiAlert v-if="expired" tone="warning">{{ t('auth.recover.expired') }}</UiAlert>
      <UiInput
        v-model="form.values.login"
        name="username"
        autocomplete="username"
        :label="t('auth.fields.login')"
        :error="form.fieldError('login')"
        :disabled="busy"
        :autofocus="!form.values.login"
        @focus="mascot.focus('login')"
        @blur="onLoginBlur"
      />
      <UiInput
        ref="keyRef"
        v-model="recoveryKey"
        monospace
        name="recovery-key"
        autocomplete="off"
        placeholder="ILRK1-XXXX-XXXX-…"
        :label="t('auth.fields.recoveryKey')"
        :hint="t('auth.recover.keyHint')"
        :error="keyError"
        :disabled="busy"
        :autofocus="Boolean(form.values.login)"
        @focus="mascot.focus('secret')"
        @blur="onKeyBlur"
      />
      <UiAlert v-if="mergeWarning" tone="warning">{{ mergeWarning }}</UiAlert>
      <CryptoProgress v-if="busy" :stage="stage" />
      <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
      <UiButton type="submit" size="lg" block :loading="busy">{{ t('auth.recover.submit') }}</UiButton>
    </form>

    <!-- шаг 2: второй фактор — код 2FA или задержка 48 часов -->
    <RecoveryFactor
      v-else-if="step === 'factor' && pending"
      :recovery="pending"
      :mascot="mascot"
      @phase="onFactorPhase"
      @unlocked="onUnlocked"
      @expired="restart({ expired: true })"
    />

    <!-- шаг 3: новый пароль -->
    <form v-else-if="step === 'password'" class="recover__form" novalidate @submit.prevent="submitPassword">
      <input type="hidden" name="username" autocomplete="username" :value="form.values.login" />
      <UiInput
        v-model="passwordForm.values.password"
        type="password"
        name="new-password"
        autocomplete="new-password"
        revealable
        autofocus
        :label="t('auth.fields.newPassword')"
        :hint="t('auth.register.passwordHint')"
        :error="passwordForm.fieldError('password')"
        :disabled="busy"
        @focus="mascot.focus('password')"
        @blur="onPasswordBlur('password')"
        @reveal="mascot.reveal"
      />
      <UiInput
        v-model="passwordForm.values.passwordConfirm"
        type="password"
        name="new-password-confirm"
        autocomplete="new-password"
        revealable
        :label="t('auth.fields.passwordConfirm')"
        :error="passwordForm.fieldError('passwordConfirm')"
        :disabled="busy"
        @focus="mascot.focus('password')"
        @blur="onPasswordBlur('passwordConfirm')"
        @reveal="mascot.reveal"
      />
      <UiAlert v-if="cancelled" tone="info">{{ t('auth.recover.cancelled') }}</UiAlert>
      <CryptoProgress v-if="busy" :stage="stage" />
      <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
      <UiButton type="submit" size="lg" block :loading="busy">{{ t('auth.recover.passwordSubmit') }}</UiButton>
    </form>

    <!-- шаг 4 (восстановление без 2FA): новая 2FA обязательна — телефона нет -->
    <div v-else-if="step === 'totp'" class="recover__form">
      <TotpEnroll
        v-if="totpEnrollment"
        ref="totpRef"
        v-model:code="totpCode"
        :enrollment="totpEnrollment"
        :submitting="totpBusy"
        :error="totpError"
        :submit-label="t('auth.recover.totpSubmit')"
        @submit="confirmTotp"
        @focus="mascot.focus('secret')"
        @blur="mascot.blur()"
      >
        <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
      </TotpEnroll>
      <template v-else>
        <p v-if="totpBusy" class="recover__loading" role="status">
          <UiSpinner :size="16" />{{ t('auth.recover.totpPreparing') }}
        </p>
        <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
        <UiButton v-if="!totpBusy" size="lg" block @click="startTotp">{{ t('auth.recover.totpRetry') }}</UiButton>
      </template>
    </div>

    <!-- шаг 5: доступ восстановлен → перевыпустить Recovery Key -->
    <div v-else class="recover__form">
      <RecoveryKeyReissue
        v-if="currentAuthKey"
        :current-auth-key="currentAuthKey"
        :login="form.values.login"
        @mood="mascot.react"
      />
      <UiButton size="lg" block :to="{ name: 'dashboard' }">
        {{ t('auth.recover.finish') }}<ArrowRight :size="18" aria-hidden="true" />
      </UiButton>
    </div>

    <MergeDialog :request="mergeRequest" @choose="answerMerge" />

    <template v-if="step === 'key' || step === 'factor'" #footer>
      <RouterLink :to="{ name: 'login' }">{{ t('auth.recover.back') }}</RouterLink>
    </template>
  </AuthCard>
</template>

<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next'
import { AuthCard } from '@/components/AuthCard'
import { CryptoProgress } from '@/components/CryptoProgress'
import { MergeDialog } from '@/components/MergeDialog'
import { RecoveryFactor } from '@/components/RecoveryFactor'
import { RecoveryKeyReissue } from '@/components/RecoveryKeyReissue'
import { TotpEnroll } from '@/components/TotpEnroll'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiInput } from '@/ui/UiInput'
import { UiSpinner } from '@/ui/UiSpinner'
import { useRecoverView } from './useRecoverView'

const {
  t,
  mascot,
  step,
  title,
  subtitle,
  expired,
  cancelled,
  busy,
  stage,
  error,
  form,
  recoveryKey,
  keyError,
  keyRef,
  mergeRequest,
  answerMerge,
  mergeWarning,
  onLoginBlur,
  onKeyBlur,
  submitKey,
  pending,
  onFactorPhase,
  onUnlocked,
  restart,
  passwordForm,
  onPasswordBlur,
  submitPassword,
  currentAuthKey,
  totpEnrollment,
  totpBusy,
  totpCode,
  totpError,
  totpRef,
  startTotp,
  confirmTotp,
} = useRecoverView()
</script>

<style scoped src="./RecoverView.css"></style>
