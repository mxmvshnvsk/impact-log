<template>
  <section class="key-reissue" aria-labelledby="key-reissue-title">
    <div class="key-reissue__head">
      <span class="key-reissue__icon" :class="{ 'key-reissue__icon--done': state === 'done' }">
        <Check v-if="state === 'done'" :size="18" aria-hidden="true" />
        <KeyRound v-else :size="18" aria-hidden="true" />
      </span>
      <div>
        <h2 id="key-reissue-title" class="key-reissue__title">{{ t('auth.reissueKey.title') }}</h2>
        <p class="key-reissue__text">
          {{ state === 'done' ? t('auth.reissueKey.done') : t('auth.reissueKey.text') }}
        </p>
      </div>
    </div>
    <UiButton v-if="state === 'idle'" variant="secondary" :loading="busy" @click="start">
      {{ t('auth.reissueKey.action') }}
    </UiButton>
    <form v-else-if="state === 'kit' && material" class="key-reissue__form" novalidate @submit.prevent="submit">
      <RecoveryKit ref="kitRef" :recovery-key="material.recoveryKey" :login="login" />
      <UiButton type="submit" block :loading="busy">{{ t('auth.reissueKey.submit') }}</UiButton>
    </form>
    <UiAlert v-if="error" tone="danger" class="key-reissue__error">{{ t(error) }}</UiAlert>
  </section>
</template>

<script setup lang="ts">
import { Check, KeyRound } from 'lucide-vue-next'
import { RecoveryKit } from '@/components/RecoveryKit'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import {
  type RecoveryKeyReissueEmits,
  type RecoveryKeyReissueProps,
  useRecoveryKeyReissue,
} from './useRecoveryKeyReissue'

const props = defineProps<RecoveryKeyReissueProps>()
const emit = defineEmits<RecoveryKeyReissueEmits>()
const { t, state, busy, error, material, kitRef, start, submit } = useRecoveryKeyReissue(
  props,
  emit,
)
</script>

<style scoped src="./RecoveryKeyReissue.css"></style>
