<template>
  <div class="key-rotation">
    <!-- 1. что это и чего не делает -->
    <template v-if="view === 'explain'">
      <div class="key-rotation__explain">
        <section class="key-rotation__block">
          <h4 class="key-rotation__h">{{ t('account.keyRotation.explain.whatTitle') }}</h4>
          <ul class="key-rotation__list">
            <li v-for="item in what" :key="item.key" class="key-rotation__item">
              <component :is="item.icon" :size="16" class="key-rotation__item-icon" aria-hidden="true" />
              <span>{{ t(`account.keyRotation.explain.what.${item.key}`) }}</span>
            </li>
          </ul>
        </section>
        <section class="key-rotation__block">
          <h4 class="key-rotation__h">{{ t('account.keyRotation.explain.protectsTitle') }}</h4>
          <p class="key-rotation__text">{{ t('account.keyRotation.explain.protects') }}</p>
        </section>
        <section class="key-rotation__block">
          <h4 class="key-rotation__h">{{ t('account.keyRotation.explain.limitsTitle') }}</h4>
          <p class="key-rotation__text">{{ t('account.keyRotation.explain.limits') }}</p>
        </section>
        <section class="key-rotation__block">
          <h4 class="key-rotation__h">{{ t('account.keyRotation.explain.timeTitle') }}</h4>
          <p class="key-rotation__text">{{ t('account.keyRotation.explain.time', { n: count ?? '—' }) }}</p>
        </section>
      </div>
      <div class="security-form__actions">
        <UiButton @click="toPassword">{{ t('account.keyRotation.explain.continue') }}</UiButton>
        <UiButton variant="ghost" @click="cancel">{{ t('account.security.cancel') }}</UiButton>
      </div>
    </template>

    <!-- 2. текущий пароль: тот же KEK откроет новый ключ -->
    <form v-else-if="view === 'password'" class="security-form" novalidate @submit.prevent="submitPassword">
      <input type="hidden" name="username" autocomplete="username" :value="login" />
      <UiInput
        ref="passwordRef"
        v-model="password"
        type="password"
        name="current-password"
        autocomplete="current-password"
        revealable
        :label="t('account.keyRotation.password.label')"
        :hint="t('account.keyRotation.password.hint')"
        :error="passwordError"
        :disabled="preparing"
      />
      <CryptoProgress v-if="preparing" :stage="stage" />
      <UiAlert v-if="formError" tone="danger">{{ t(formError) }}</UiAlert>
      <div class="security-form__actions">
        <UiButton type="submit" :loading="preparing">{{ t('account.keyRotation.password.submit') }}</UiButton>
        <UiButton variant="ghost" :disabled="preparing" @click="cancel">{{ t('account.security.cancel') }}</UiButton>
      </div>
    </form>

    <!-- 3. новый Recovery Key — до начала ротации на сервере -->
    <form v-else-if="view === 'kit' && kit" class="security-form" novalidate @submit.prevent="confirmKit">
      <h4 class="key-rotation__h">{{ t('account.keyRotation.kit.title') }}</h4>
      <RecoveryKit ref="kitRef" :recovery-key="kit.recoveryKey" :login="login" />
      <UiAlert tone="info">{{ t('account.keyRotation.kit.note') }}</UiAlert>
      <UiAlert v-if="error" tone="danger">{{ t(error) }}</UiAlert>
      <div class="security-form__actions">
        <UiButton type="submit">{{ t('account.keyRotation.kit.submit') }}</UiButton>
        <UiButton variant="ghost" @click="cancel">{{ t('account.security.cancel') }}</UiButton>
      </div>
    </form>

    <!-- 4. прогресс -->
    <div v-else-if="view === 'running'" class="key-rotation__progress">
      <h4 class="key-rotation__h">{{ t('account.keyRotation.progress.title') }}</h4>
      <ol class="key-rotation__steps" role="status" aria-live="polite">
        <li
          v-for="item in progress.steps"
          :key="item.key"
          class="key-rotation__step"
          :class="`key-rotation__step--${item.state}`"
        >
          <span class="key-rotation__step-icon" aria-hidden="true">
            <Check v-if="item.state === 'done'" :size="14" />
            <UiSpinner v-else-if="item.state === 'active'" :size="14" />
            <Circle v-else :size="10" />
          </span>
          <span>{{ item.label }}</span>
        </li>
      </ol>
      <UiProgress :value="progress.value" :max="100" :label="t('account.keyRotation.progress.label')" />
      <p class="security-form__hint">{{ t('account.keyRotation.progress.keepOpen') }}</p>
    </div>

    <!-- 5. сбой после начала или незавершённая ротация этого устройства -->
    <div v-else-if="view === 'failed' || view === 'unfinished'" class="key-rotation__state">
      <UiAlert :tone="view === 'failed' ? 'danger' : 'warning'">
        <strong class="key-rotation__alert-title">
          {{ t(view === 'failed' ? 'account.keyRotation.failed.title' : 'account.keyRotation.unfinished.title') }}
        </strong>
        <template v-if="view === 'failed'">
          <template v-if="error">{{ t(error) }}. </template>{{ t('account.keyRotation.failed.text') }}
        </template>
        <template v-else>{{ t('account.keyRotation.unfinished.text', { date: unfinishedAt }) }}</template>
      </UiAlert>
      <UiAlert v-if="view === 'unfinished' && error" tone="danger">{{ t(error) }}</UiAlert>
      <div class="security-form__actions">
        <UiButton @click="retry">
          <RefreshCw :size="16" aria-hidden="true" />
          {{ t(view === 'failed' ? 'account.keyRotation.failed.retry' : 'account.keyRotation.unfinished.resume') }}
        </UiButton>
        <UiButton variant="ghost" class="key-rotation__abort" @click="askAbort">
          {{ t('account.keyRotation.abort') }}
        </UiButton>
      </div>
    </div>

    <!-- 6. ротацию начало другое устройство -->
    <div v-else-if="view === 'other'" class="key-rotation__state">
      <UiAlert tone="warning">
        <strong class="key-rotation__alert-title">{{ t('account.keyRotation.other.title') }}</strong>
        {{ t('account.keyRotation.other.text', { date: otherAt }) }}
      </UiAlert>
      <form v-if="otherOpen" class="security-form" novalidate @submit.prevent="abortOther">
        <input type="hidden" name="username" autocomplete="username" :value="login" />
        <UiInput
          v-model="otherPassword"
          type="password"
          name="current-password"
          autocomplete="current-password"
          revealable
          autofocus
          :label="t('account.keyRotation.other.password')"
          :error="otherPasswordError"
          :disabled="otherBusy"
        />
        <CryptoProgress v-if="otherBusy" :stage="otherStage" />
        <UiAlert v-if="otherError" tone="danger">{{ t(otherError) }}</UiAlert>
        <div class="security-form__actions">
          <UiButton type="submit" variant="danger" :loading="otherBusy">
            {{ t('account.keyRotation.other.confirm') }}
          </UiButton>
          <UiButton variant="ghost" :disabled="otherBusy" @click="otherOpen = false">
            {{ t('account.keyRotation.other.cancel') }}
          </UiButton>
        </div>
      </form>
      <div v-else class="security-form__actions">
        <UiButton variant="secondary" @click="otherOpen = true">{{ t('account.keyRotation.other.abort') }}</UiButton>
      </div>
    </div>

    <!-- 7. готово -->
    <div v-else-if="view === 'done'" class="key-rotation__state">
      <UiAlert tone="success">
        <strong class="key-rotation__alert-title">{{ t('account.keyRotation.done.title') }}</strong>
        {{ t('account.keyRotation.done.text') }}
      </UiAlert>
      <div class="security-form__actions">
        <UiButton variant="secondary" @click="close">{{ t('account.keyRotation.done.close') }}</UiButton>
      </div>
    </div>

    <!-- 8. итог отмены -->
    <div v-else-if="view === 'notice' && notice" class="key-rotation__state">
      <UiAlert :tone="notice === 'cancelled' ? 'warning' : 'info'">
        {{ t(`account.keyRotation.notice.${notice}`) }}
      </UiAlert>
      <div class="security-form__actions">
        <UiButton variant="secondary" @click="close">{{ t('account.keyRotation.banner.dismiss') }}</UiButton>
      </div>
    </div>

    <UiDialog
      :open="abortOpen"
      tone="danger"
      :title="t('account.keyRotation.abortDialog.title')"
      :description="t('account.keyRotation.abortDialog.text')"
      :confirm-label="t('account.keyRotation.abortDialog.confirm')"
      :cancel-label="t('account.keyRotation.abortDialog.keep')"
      :loading="aborting"
      @confirm="confirmAbort"
      @cancel="abortOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { Check, Circle, KeyRound, MonitorSmartphone, RefreshCw, ShieldCheck } from 'lucide-vue-next'
import { CryptoProgress } from '@/components/CryptoProgress'
import { RecoveryKit } from '@/components/RecoveryKit'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiDialog } from '@/ui/UiDialog'
import { UiInput } from '@/ui/UiInput'
import { UiProgress } from '@/ui/UiProgress'
import { UiSpinner } from '@/ui/UiSpinner'
import { type KeyRotationEmits, useKeyRotation } from './useKeyRotation'

const emit = defineEmits<KeyRotationEmits>()

const what = [
  { key: 'newKey', icon: ShieldCheck },
  { key: 'recoveryKey', icon: KeyRound },
  { key: 'devices', icon: MonitorSmartphone },
] as const

const {
  t,
  view,
  login,
  count,
  preparing,
  toPassword,
  password,
  passwordError,
  passwordRef,
  stage,
  formError,
  submitPassword,
  cancel,
  kit,
  kitRef,
  confirmKit,
  progress,
  error,
  notice,
  unfinishedAt,
  abortOpen,
  aborting,
  askAbort,
  confirmAbort,
  retry,
  otherAt,
  otherOpen,
  otherPassword,
  otherPasswordError,
  otherBusy,
  otherStage,
  otherError,
  abortOther,
  close,
} = useKeyRotation(emit)
</script>

<style scoped src="../SecurityPanel/SecurityForm.css"></style>
<style scoped src="./KeyRotation.css"></style>
