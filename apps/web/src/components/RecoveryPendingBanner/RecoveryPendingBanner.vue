<template>
  <section
    v-if="pending && when"
    class="recovery-banner"
    aria-labelledby="recovery-banner-title"
  >
    <span class="recovery-banner__icon"><ShieldAlert :size="20" aria-hidden="true" /></span>
    <div class="recovery-banner__body">
      <h2 id="recovery-banner-title" class="recovery-banner__title">{{ t('account.recoveryPending.title') }}</h2>
      <p class="recovery-banner__text">
        {{
          when.ready
            ? t('account.recoveryPending.textReady', { date: when.date })
            : t('account.recoveryPending.text', { date: when.date, relative: when.relative })
        }}
      </p>
      <p class="recovery-banner__hint">{{ t('account.recoveryPending.itsMe') }}</p>
    </div>
    <UiButton size="sm" class="recovery-banner__action" @click="askCancel">
      {{ t('account.recoveryPending.cancel') }}
    </UiButton>
  </section>

  <section
    v-else-if="cancelled"
    class="recovery-banner recovery-banner--done"
    aria-labelledby="recovery-banner-done"
    role="status"
  >
    <span class="recovery-banner__icon"><ShieldCheck :size="20" aria-hidden="true" /></span>
    <div class="recovery-banner__body">
      <h2 id="recovery-banner-done" class="recovery-banner__title">{{ t('account.recoveryPending.doneTitle') }}</h2>
      <p class="recovery-banner__text">{{ t('account.recoveryPending.doneText') }}</p>
    </div>
    <div class="recovery-banner__actions">
      <UiButton size="sm" :to="reissueTo" @click="dismiss">{{ t('account.recoveryPending.reissue') }}</UiButton>
      <UiIconButton :label="t('account.recoveryPending.dismiss')" @click="dismiss">
        <X :size="18" aria-hidden="true" />
      </UiIconButton>
    </div>
  </section>

  <UiDialog
    :open="confirmOpen"
    :title="t('account.recoveryPending.confirmTitle')"
    :description="t('account.recoveryPending.confirmText')"
    :confirm-label="t('account.recoveryPending.confirm')"
    :cancel-label="t('account.recoveryPending.keep')"
    :loading="cancelling"
    @confirm="confirmCancel"
    @cancel="closeConfirm"
  >
    <UiAlert v-if="cancelError" tone="danger">{{ t(cancelError) }}</UiAlert>
  </UiDialog>
</template>

<script setup lang="ts">
import { ShieldAlert, ShieldCheck, X } from 'lucide-vue-next'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiDialog } from '@/ui/UiDialog'
import { UiIconButton } from '@/ui/UiIconButton'
import { useRecoveryPendingBanner } from './useRecoveryPendingBanner'

const {
  t,
  pending,
  when,
  confirmOpen,
  cancelling,
  cancelError,
  cancelled,
  askCancel,
  closeConfirm,
  confirmCancel,
  dismiss,
  reissueTo,
} = useRecoveryPendingBanner()
</script>

<style scoped src="./RecoveryPendingBanner.css"></style>
