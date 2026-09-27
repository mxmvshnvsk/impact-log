<template>
  <span class="ui-logo" :class="{ 'ui-logo--compact': compact, 'ui-logo--responsive': responsive }">
    <span class="ui-logo__mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="32" height="32">
        <rect width="32" height="32" rx="9" fill="currentColor" />
        <path d="M9 11l5 5-5 5" fill="none" stroke="#22c77a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
        <rect x="16" y="19.4" width="8" height="2.6" rx="1.3" fill="#22c77a" />
      </svg>
    </span>
    <span v-if="!compact" class="ui-logo__word">impact log</span>
    <span v-else class="sr-only">impact log</span>
  </span>
</template>

<script setup lang="ts">
defineProps<{
  /** Только знак, без названия */
  compact?: boolean
  /** Название скрывается на mobile (узкие шапки) */
  responsive?: boolean
}>()
</script>

<style scoped src="./UiLogo.css"></style>
