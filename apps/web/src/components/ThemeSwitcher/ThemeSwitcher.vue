<template>
  <UiIconButton :label="label" variant="solid" class="theme-switcher" @click="cycle">
    <component :is="icon" :size="18" aria-hidden="true" />
  </UiIconButton>
</template>

<script setup lang="ts">
import { UiIconButton } from '@/ui/UiIconButton'
import { useThemeSwitcher } from './useThemeSwitcher'

const { label, icon, cycle } = useThemeSwitcher()
</script>

<style scoped src="./ThemeSwitcher.css"></style>
