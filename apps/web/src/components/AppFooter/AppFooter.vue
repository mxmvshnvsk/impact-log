<template>
  <footer class="app-footer" :class="{ 'app-footer--compact': compact }">
    <div class="app-footer__inner l-container">
      <span class="app-footer__brand">© {{ year }} impact log</span>
      <nav class="app-footer__links" :aria-label="t('footer.label')">
        <RouterLink :to="{ name: 'principles' }">{{ t('nav.principles') }}</RouterLink>
      </nav>
      <span class="app-footer__status">
        <span class="app-footer__prompt">~$</span><ApiStatus />
      </span>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { ApiStatus } from '@/components/ApiStatus'
import { useAppFooter } from './useAppFooter'

defineProps<{ compact?: boolean }>()
const { t, year } = useAppFooter()
</script>

<style scoped src="./AppFooter.css"></style>
