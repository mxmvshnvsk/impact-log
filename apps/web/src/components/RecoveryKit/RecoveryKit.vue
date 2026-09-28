<template>
  <div class="recovery-kit">
    <UiAlert tone="warning">{{ t('auth.recoveryKit.warning') }}</UiAlert>
    <p class="recovery-kit__explain">{{ t('auth.recoveryKit.explain') }}</p>

    <figure class="recovery-kit__key">
      <figcaption class="recovery-kit__key-label">
        <KeyRound :size="14" aria-hidden="true" />{{ t('auth.recoveryKit.label') }}
      </figcaption>
      <code class="recovery-kit__key-value" :aria-label="spelled" translate="no">
        <span v-for="(group, index) in groups" :key="index" class="recovery-kit__group">{{
          index < groups.length - 1 ? `${group}-` : group
        }}</span>
      </code>
    </figure>

    <div class="recovery-kit__actions">
      <UiButton size="sm" variant="secondary" @click="download">
        <Download :size="16" aria-hidden="true" />{{ t('auth.recoveryKit.download') }}
      </UiButton>
      <UiButton size="sm" variant="secondary" @click="print">
        <Printer :size="16" aria-hidden="true" />{{ t('auth.recoveryKit.print') }}
      </UiButton>
      <UiButton size="sm" variant="secondary" @click="copy">
        <Check v-if="copied" :size="16" aria-hidden="true" />
        <Copy v-else :size="16" aria-hidden="true" />
        {{ copied ? t('auth.recoveryKit.copied') : t('auth.recoveryKit.copy') }}
      </UiButton>
    </div>

    <div class="recovery-kit__confirm">
      <UiCheckbox v-model="saved">{{ t('auth.recoveryKit.saved') }}</UiCheckbox>
      <p v-if="savedError" class="recovery-kit__error" role="alert">
        <CircleAlert :size="14" aria-hidden="true" />{{ savedError }}
      </p>
    </div>
    <UiInput
      ref="tailRef"
      v-model="tail"
      monospace
      name="recovery-key-tail"
      autocomplete="off"
      :maxlength="8"
      :label="t('auth.recoveryKit.tail')"
      :hint="t('auth.recoveryKit.tailHint')"
      :error="tailError"
      @blur="onTailBlur"
    />

    <!--
      Лист для печати: на экране скрыт, при печати виден только он (RecoveryKit.print.css).
      Вынесен в <body>, чтобы при печати остальное приложение убиралось целиком, без пустых страниц
    -->
    <Teleport to="body">
    <section class="recovery-kit-sheet" aria-hidden="true">
      <h1 class="recovery-kit-sheet__title">impact log — {{ t('auth.recoveryKit.file.title') }}</h1>
      <p>{{ t('auth.recoveryKit.file.login') }}: <strong>{{ login }}</strong></p>
      <p>{{ t('auth.recoveryKit.file.created') }}: {{ createdAt }}</p>
      <p class="recovery-kit-sheet__key">{{ recoveryKey }}</p>
      <ul>
        <li v-for="(line, index) in instructions" :key="index">{{ line }}</li>
      </ul>
    </section>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { Check, CircleAlert, Copy, Download, KeyRound, Printer } from 'lucide-vue-next'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiCheckbox } from '@/ui/UiCheckbox'
import { UiInput } from '@/ui/UiInput'
import { type RecoveryKitProps, useRecoveryKit } from './useRecoveryKit'

const props = defineProps<RecoveryKitProps>()
const {
  t,
  groups,
  spelled,
  createdAt,
  instructions,
  copied,
  copy,
  download,
  print,
  saved,
  savedError,
  tail,
  tailError,
  tailRef,
  onTailBlur,
  validate,
} = useRecoveryKit(props)

defineExpose({ validate })
</script>

<style scoped src="./RecoveryKit.css"></style>
<style src="./RecoveryKit.print.css"></style>
