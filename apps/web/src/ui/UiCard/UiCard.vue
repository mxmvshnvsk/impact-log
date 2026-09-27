<template>
  <component
    :is="as"
    class="ui-card"
    :class="[`ui-card--${variant}`, `ui-card--pad-${padding}`]"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    as?: string
    variant?: 'solid' | 'muted' | 'glass'
    padding?: 'none' | 'md' | 'lg'
  }>(),
  { as: 'section', variant: 'solid', padding: 'md' },
)
</script>

<style scoped src="./UiCard.css"></style>
