<template>
  <!-- A: код из приложения 2FA -->
  <form v-if="phase === 'code'" class="factor" novalidate @submit.prevent="submitCode()">
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
    <CryptoProgress v-if="busy" :stage="stage" />
    <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
    <UiButton type="submit" size="lg" block :loading="busy">{{ t('auth.recoverFactor.codeSubmit') }}</UiButton>
    <button type="button" class="factor__link" :disabled="busy" @click="go(when ? 'pending' : 'explain')">
      <Hourglass :size="14" aria-hidden="true" />{{ t('auth.recoverFactor.noAccess') }}
    </button>
  </form>

  <!-- C, ещё не начато: честно о задержке и предупреждении -->
  <div v-else-if="phase === 'explain'" class="factor">
    <p class="factor__lead">{{ t('auth.recoverFactor.explain', { hours: delayHours }) }}</p>
    <ol class="factor__steps">
      <li>{{ t('auth.recoverFactor.steps.start', { hours: delayHours }) }}</li>
      <li>{{ t('auth.recoverFactor.steps.return', { hours: delayHours }) }}</li>
      <li>{{ t('auth.recoverFactor.steps.finish') }}</li>
    </ol>
    <p class="factor__note">{{ t('auth.recoverFactor.phoneFound') }}</p>
    <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
    <UiButton size="lg" block :loading="busy" @click="startDelay">
      <Hourglass :size="18" aria-hidden="true" />{{ t('auth.recoverFactor.startDelay', { hours: delayHours }) }}
    </UiButton>
    <button type="button" class="factor__link factor__link--muted" :disabled="busy" @click="go('code')">
      <ArrowLeft :size="14" aria-hidden="true" />{{ t('auth.recoverFactor.haveCode') }}
    </button>
  </div>

  <!-- C, отсчёт идёт -->
  <div v-else-if="phase === 'started' || phase === 'pending'" class="factor">
    <div v-if="when" class="factor__when" role="status">
      <span class="factor__when-icon"><CalendarClock :size="20" aria-hidden="true" /></span>
      <div class="factor__when-body">
        <span class="factor__when-label">{{ t('auth.recoverFactor.availableLabel') }}</span>
        <strong class="factor__when-date">{{ when.date }}</strong>
        <span class="factor__when-relative">{{ when.ready ? t('auth.recoverFactor.availableNow') : when.relative }}</span>
      </div>
    </div>
    <p class="factor__lead">{{ t('auth.recoverFactor.comeBack', { days: readyDays }) }}</p>
    <UiAlert tone="info">{{ t('auth.recoverFactor.cancelElsewhere') }}</UiAlert>
    <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
    <UiButton v-if="when?.ready" size="lg" block :loading="busy" @click="resume">
      {{ t('auth.recoverFactor.resume') }}
    </UiButton>
    <button type="button" class="factor__link" :disabled="busy" @click="go('code')">
      <Smartphone :size="14" aria-hidden="true" />{{ t('auth.recoverFactor.phoneFoundAction') }}
    </button>
  </div>

  <!-- C, задержка прошла -->
  <div v-else class="factor">
    <UiAlert tone="success">
      {{ t('auth.recoverFactor.readyText', { hours: delayHours, until: readyUntil ?? '' }) }}
    </UiAlert>
    <CryptoProgress v-if="busy" :stage="stage" />
    <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
    <UiButton size="lg" block :loading="busy" @click="resume">{{ t('auth.recoverFactor.resume') }}</UiButton>
    <button type="button" class="factor__link factor__link--muted" :disabled="busy" @click="go('code')">
      <Smartphone :size="14" aria-hidden="true" />{{ t('auth.recoverFactor.useCodeInstead') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft, CalendarClock, Hourglass, Smartphone } from 'lucide-vue-next'
import { CryptoProgress } from '@/components/CryptoProgress'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiOtpInput } from '@/ui/UiOtpInput'
import {
  type RecoveryFactorEmits,
  type RecoveryFactorProps,
  useRecoveryFactor,
} from './useRecoveryFactor'

const props = defineProps<RecoveryFactorProps>()
const emit = defineEmits<RecoveryFactorEmits>()
const {
  t,
  phase,
  busy,
  stage,
  error,
  code,
  codeError,
  otpRef,
  when,
  readyUntil,
  delayHours,
  readyDays,
  go,
  submitCode,
  startDelay,
  resume,
} = useRecoveryFactor(props, emit)
</script>

<style scoped src="./RecoveryFactor.css"></style>
