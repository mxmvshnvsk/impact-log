<template>
  <section class="settings">
    <h1 class="settings__title">{{ t('account.settings.title') }}</h1>
    <UiTabs :items="tabs" :label="t('account.settings.tabsLabel')" />
    <div class="settings__body">
      <RouterView />
    </div>
  </section>
</template>

<script setup lang="ts">
import { UiTabs } from '@/ui/UiTabs'
import { useSettingsView } from './useSettingsView'

const { t, tabs } = useSettingsView()
</script>

<style scoped src="./SettingsView.css"></style>
