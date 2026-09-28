<template>
  <div class="app-layout">
    <a class="app-layout__skip" href="#main-content" @click.prevent="skipToContent">{{ t('nav.skip') }}</a>
    <aside class="app-layout__sidebar">
      <RouterLink :to="{ name: 'dashboard' }" class="app-layout__logo">
        <UiLogo compact />
      </RouterLink>
      <nav class="app-layout__nav" :aria-label="t('nav.label')">
        <UiIconButton
          v-for="item in items"
          :key="item.key"
          :label="item.label"
          :to="item.to"
          :active="item.active"
          :disabled="!item.to"
        >
          <component :is="item.icon" :size="20" aria-hidden="true" />
        </UiIconButton>
      </nav>
    </aside>

    <div class="app-layout__main">
      <header class="app-layout__header">
        <div class="app-layout__header-inner l-container">
          <RouterLink :to="{ name: 'dashboard' }" class="app-layout__header-logo">
            <UiLogo compact />
          </RouterLink>
          <p class="app-layout__title">{{ title }}</p>
          <div class="app-layout__actions">
            <ThemeSwitcher />
            <LocaleSwitcher />
            <SyncIndicator />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main id="main-content" ref="mainRef" class="app-layout__content l-container" tabindex="-1">
        <slot />
      </main>

      <AppFooter />
    </div>

    <nav class="app-layout__tabbar" :aria-label="t('nav.label')">
      <component
        :is="item.to ? RouterLink : 'span'"
        v-for="item in items"
        :key="item.key"
        :to="item.to"
        class="app-layout__tab"
        :class="{ 'app-layout__tab--active': item.active, 'app-layout__tab--soon': !item.to }"
        :aria-current="item.active ? 'page' : undefined"
        :aria-disabled="!item.to || undefined"
      >
        <component :is="item.icon" :size="20" aria-hidden="true" />
        <span>{{ item.shortLabel }}</span>
      </component>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { AccountMenu } from '@/components/AccountMenu'
import { AppFooter } from '@/components/AppFooter'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import { SyncIndicator } from '@/components/SyncIndicator'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { UiIconButton } from '@/ui/UiIconButton'
import { UiLogo } from '@/ui/UiLogo'
import { useAppLayout } from './useAppLayout'

const { t, items, title, mainRef, skipToContent } = useAppLayout()
</script>

<style scoped src="./AppLayout.css"></style>
