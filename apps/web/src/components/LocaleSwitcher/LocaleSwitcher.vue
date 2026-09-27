<template>
  <div class="locale-switcher" role="group" :aria-label="t('locale.label')">
    <button
      v-for="item in locales"
      :key="item"
      type="button"
      class="locale-switcher__button"
      :class="{ 'locale-switcher__button--active': item === locale }"
      :aria-pressed="item === locale"
      @click="setLocale(item)"
    >
      {{ t(`locale.${item}`) }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useLocaleSwitcher } from './useLocaleSwitcher'

const { t, locale, locales, setLocale } = useLocaleSwitcher()
</script>

<style scoped src="./LocaleSwitcher.css"></style>
