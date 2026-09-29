<template>
  <section
    v-if="view"
    class="rotation-banner"
    :class="`rotation-banner--${view}`"
    aria-labelledby="rotation-banner-title"
  >
    <span class="rotation-banner__icon">
      <UiSpinner v-if="view === 'running'" :size="20" />
      <ShieldCheck v-else-if="view === 'done'" :size="20" aria-hidden="true" />
      <RefreshCcwDot v-else :size="20" aria-hidden="true" />
    </span>
    <div class="rotation-banner__body">
      <h2 id="rotation-banner-title" class="rotation-banner__title">{{ title }}</h2>
      <p class="rotation-banner__text">{{ text }}</p>
      <UiProgress
        v-if="view === 'running'"
        class="rotation-banner__progress"
        :value="percent"
        :max="100"
        :label="t('account.keyRotation.progress.label')"
      />
    </div>
    <div v-if="view === 'unfinished' || view === 'failed'" class="rotation-banner__actions">
      <UiButton size="sm" @click="resume">
        {{ t(view === 'failed' ? 'account.keyRotation.failed.retry' : 'account.keyRotation.unfinished.resume') }}
      </UiButton>
      <UiButton size="sm" variant="ghost" @click="abortOpen = true">{{ t('account.keyRotation.abort') }}</UiButton>
    </div>
    <div v-else-if="view === 'done' || view === 'notice'" class="rotation-banner__actions">
      <UiButton size="sm" variant="secondary" :to="detailsTo" @click="dismiss">
        {{ t('account.security.title') }}
      </UiButton>
      <UiIconButton :label="t('account.keyRotation.banner.dismiss')" @click="dismiss">
        <X :size="18" aria-hidden="true" />
      </UiIconButton>
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
  </section>
</template>

<script setup lang="ts">
import { RefreshCcwDot, ShieldCheck, X } from 'lucide-vue-next'
import { UiButton } from '@/ui/UiButton'
import { UiDialog } from '@/ui/UiDialog'
import { UiIconButton } from '@/ui/UiIconButton'
import { UiProgress } from '@/ui/UiProgress'
import { UiSpinner } from '@/ui/UiSpinner'
import { useKeyRotationBanner } from './useKeyRotationBanner'

const {
  t,
  view,
  title,
  text,
  percent,
  resume,
  dismiss,
  abortOpen,
  aborting,
  confirmAbort,
  detailsTo,
} = useKeyRotationBanner()
</script>

<style scoped src="./KeyRotationBanner.css"></style>
