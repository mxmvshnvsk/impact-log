<template>
  <svg
    class="ui-spinner"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    role="img"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.2" stroke-width="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 20 })
</script>

<style scoped src="./UiSpinner.css"></style>
