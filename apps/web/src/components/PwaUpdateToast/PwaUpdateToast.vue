<template>
  <div class="pwa-update" role="status">
    <Transition name="pwa-update">
      <div v-if="available" class="pwa-update__toast">
        <Sparkles class="pwa-update__icon" :size="18" aria-hidden="true" />
        <p class="pwa-update__text">{{ t('pwa.update.message') }}</p>
        <UiButton size="sm" :loading="applying" @click="apply">{{ t('pwa.update.action') }}</UiButton>
        <UiIconButton :label="t('pwa.update.later')" @click="dismiss">
          <X :size="18" aria-hidden="true" />
        </UiIconButton>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { Sparkles, X } from 'lucide-vue-next'
import { UiButton } from '@/ui/UiButton'
import { UiIconButton } from '@/ui/UiIconButton'
import { usePwaUpdateToast } from './usePwaUpdateToast'

const { t, available, applying, apply, dismiss } = usePwaUpdateToast()
</script>

<style scoped src="./PwaUpdateToast.css"></style>
