<template>
  <div class="app">
    <header class="app__header">
      <div class="app__header-inner l-container">
        <RouterLink to="/" class="app__logo">~/impact-log</RouterLink>
        <LocaleSwitcher />
      </div>
    </header>
    <main class="app__main l-container">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
</script>

<style scoped src="./App.css"></style>
