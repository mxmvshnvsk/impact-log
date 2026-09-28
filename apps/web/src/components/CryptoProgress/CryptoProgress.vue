<template>
  <div class="crypto-progress" role="status" aria-live="polite">
    <div class="crypto-progress__row">
      <UiSpinner class="crypto-progress__spinner" :size="18" />
      <span class="crypto-progress__text">{{ stage ? t(`auth.stages.${stage}`) : '' }}</span>
    </div>
    <span class="crypto-progress__track" aria-hidden="true"><span class="crypto-progress__bar" /></span>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AccountStage } from '@/composables/useAccount'
import { UiSpinner } from '@/ui/UiSpinner'

/** Прогресс долгой криптографической операции: этап — текстом, полоса — неопределённая */
defineProps<{ stage: AccountStage | null }>()
const { t } = useI18n()
</script>

<style scoped src="./CryptoProgress.css"></style>
