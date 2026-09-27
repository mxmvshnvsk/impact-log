<template>
  <component
    :is="to ? RouterLink : 'button'"
    :to="to"
    :type="to ? undefined : 'button'"
    class="ui-icon-button"
    :class="[`ui-icon-button--${variant}`, { 'ui-icon-button--active': active }]"
    :aria-label="label"
    :title="label"
    :aria-current="active ? 'page' : undefined"
    :disabled="to ? undefined : disabled"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
import { type RouteLocationRaw, RouterLink } from 'vue-router'

withDefaults(
  defineProps<{
    /** Обязательная подпись для скринридеров и тултипа */
    label: string
    variant?: 'ghost' | 'solid'
    to?: RouteLocationRaw
    active?: boolean
    disabled?: boolean
  }>(),
  { variant: 'ghost' },
)
</script>

<style scoped src="./UiIconButton.css"></style>
