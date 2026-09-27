<template>
  <div
    class="ui-progress"
    role="progressbar"
    :aria-valuemin="0"
    :aria-valuemax="max"
    :aria-valuenow="value"
    :aria-label="label"
  >
    <span class="ui-progress__bar" :style="{ width: `${(value / max) * 100}%` }" />
  </div>
</template>

<script setup lang="ts">
defineProps<{ value: number; max: number; label?: string }>()
</script>

<style scoped src="./UiProgress.css"></style>
