<template>
  <div class="auth-layout">
    <header class="auth-layout__header l-container">
      <RouterLink to="/login" class="auth-layout__logo"><UiLogo /></RouterLink>
      <div class="auth-layout__prefs">
        <ThemeSwitcher />
        <LocaleSwitcher />
      </div>
    </header>
    <main class="auth-layout__main">
      <slot />
    </main>
    <AppFooter compact />
  </div>
</template>

<script setup lang="ts">
import { AppFooter } from '@/components/AppFooter'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { UiLogo } from '@/ui/UiLogo'
</script>

<style scoped src="./AuthLayout.css"></style>
