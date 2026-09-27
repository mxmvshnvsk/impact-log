<template>
  <div class="public-layout">
    <header class="public-layout__header">
      <div class="public-layout__header-inner l-container">
        <RouterLink :to="{ name: 'landing' }" class="public-layout__logo">
          <UiLogo responsive />
        </RouterLink>
        <div class="public-layout__actions">
          <ThemeSwitcher />
          <LocaleSwitcher />
          <UiButton v-if="isAuthenticated" size="sm" :to="{ name: 'dashboard' }">
            {{ t('nav.openApp') }}
          </UiButton>
          <template v-else>
            <!-- mobile: только «Вход» (регистрация — ссылкой со страницы входа) -->
            <UiButton class="public-layout__mobile-only" size="sm" :to="{ name: 'login' }">
              {{ t('auth.login.title') }}
            </UiButton>
            <UiButton class="public-layout__wide-only" size="sm" variant="ghost" :to="{ name: 'login' }">
              {{ t('auth.login.title') }}
            </UiButton>
            <UiButton class="public-layout__wide-only" size="sm" :to="{ name: 'register' }">
              {{ t('auth.register.cta') }}
            </UiButton>
          </template>
        </div>
      </div>
    </header>
    <main class="public-layout__main l-container">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import { AppFooter } from '@/components/AppFooter'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { UiButton } from '@/ui/UiButton'
import { UiLogo } from '@/ui/UiLogo'
import { usePublicLayout } from './usePublicLayout'

const { t, isAuthenticated } = usePublicLayout()
</script>

<style scoped src="./PublicLayout.css"></style>
