<template>
  <component
    :is="to ? RouterLink : 'button'"
    :to="to"
    :type="to ? undefined : type"
    class="ui-button"
    :class="[`ui-button--${variant}`, `ui-button--${size}`, { 'ui-button--block': block, 'ui-button--loading': loading }]"
    :disabled="to ? undefined : disabled || loading"
    :aria-busy="loading || undefined"
  >
    <UiSpinner v-if="loading" class="ui-button__spinner" :size="16" />
    <span class="ui-button__content"><slot /></span>
  </component>
</template>

<script setup lang="ts">
import { type RouteLocationRaw, RouterLink } from 'vue-router'
import { UiSpinner } from '@/ui/UiSpinner'

withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    type?: 'button' | 'submit'
    to?: RouteLocationRaw
    block?: boolean
    loading?: boolean
    disabled?: boolean
  }>(),
  { variant: 'primary', size: 'md', type: 'button' },
)
</script>

<style scoped src="./UiButton.css"></style>
