<template>
  <a class="alpha-badge" :href="issuesUrl" target="_blank" rel="noopener noreferrer" :title="t('alpha.title')">
    {{ t('alpha.badge') }}
    <span class="sr-only">{{ t('alpha.title') }} {{ t('footer.newTab') }}</span>
  </a>
</template>

<script setup lang="ts">
import { useAlphaBadge } from './useAlphaBadge'

const { t, issuesUrl } = useAlphaBadge()
</script>

<style scoped src="./AlphaBadge.css"></style>
