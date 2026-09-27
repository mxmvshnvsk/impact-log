<template>
  <span class="api-status" :class="`api-status--${state}`" :title="label" role="status">
    <span class="api-status__cursor" aria-hidden="true">_</span>
    <span class="sr-only">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { useApiStatus } from './useApiStatus'

const { state, label } = useApiStatus()
</script>

<style scoped src="./ApiStatus.css"></style>
