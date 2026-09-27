<template>
  <span class="ui-eyebrow" :class="`ui-eyebrow--${tone}`"><slot /></span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'accent' | 'neutral' }>(), { tone: 'accent' })
</script>

<style scoped src="./UiEyebrow.css"></style>
