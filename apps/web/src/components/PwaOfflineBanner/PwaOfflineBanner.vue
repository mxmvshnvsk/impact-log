<template>
  <!-- Живая область существует всегда — скринридер объявит появление плашки -->
  <div class="pwa-offline" role="status">
    <Transition name="pwa-offline">
      <p v-if="offline" class="pwa-offline__pill">
        <CloudOff class="pwa-offline__icon" :size="16" aria-hidden="true" />
        <span>{{ message }}</span>
      </p>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { CloudOff } from 'lucide-vue-next'
import { usePwaOfflineBanner } from './usePwaOfflineBanner'

const { offline, message } = usePwaOfflineBanner()
</script>

<style scoped src="./PwaOfflineBanner.css"></style>
