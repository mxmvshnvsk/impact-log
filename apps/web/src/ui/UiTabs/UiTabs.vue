<template>
  <nav class="ui-tabs" :aria-label="label">
    <ul class="ui-tabs__list">
      <li v-for="item in items" :key="item.key" class="ui-tabs__item">
        <RouterLink
          :to="item.to"
          class="ui-tabs__link"
          active-class="ui-tabs__link--active"
          exact-active-class="ui-tabs__link--active"
        >
          {{ item.label }}
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import type { UiTabsProps } from './types'

defineProps<UiTabsProps>()
</script>

<style scoped src="./UiTabs.css"></style>
