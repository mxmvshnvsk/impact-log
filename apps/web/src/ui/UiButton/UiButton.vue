<template>
  <component
    :is="to ? RouterLink : href ? 'a' : 'button'"
    :to="to"
    :href="to ? undefined : href"
    :type="to || href ? undefined : type"
    class="ui-button"
    :class="[`ui-button--${variant}`, `ui-button--${size}`, { 'ui-button--block': block, 'ui-button--loading': loading }]"
    :disabled="to || href ? undefined : disabled || loading"
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
    /** Обычная ссылка (например, внешняя); target/rel передаются атрибутами */
    href?: string
    block?: boolean
    loading?: boolean
    disabled?: boolean
  }>(),
  { variant: 'primary', size: 'md', type: 'button' },
)
</script>

<style scoped src="./UiButton.css"></style>
