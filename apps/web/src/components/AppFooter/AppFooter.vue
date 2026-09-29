<template>
  <footer class="app-footer" :class="{ 'app-footer--compact': compact }">
    <div class="app-footer__inner l-container">
      <span class="app-footer__brand">© {{ year }} impact log</span>
      <nav class="app-footer__links" :aria-label="t('footer.label')">
        <RouterLink :to="{ name: 'principles' }">{{ t('nav.principles') }}</RouterLink>
        <a :href="sourceUrl" target="_blank" rel="noopener noreferrer" class="app-footer__external">
          {{ t('footer.source') }}<ExternalLink :size="12" aria-hidden="true" />
          <span class="sr-only">{{ t('footer.newTab') }}</span>
        </a>
      </nav>
      <span class="app-footer__status">
        <span class="app-footer__prompt">~$</span><ApiStatus />
      </span>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next'
import { ApiStatus } from '@/components/ApiStatus'
import { useAppFooter } from './useAppFooter'

defineProps<{ compact?: boolean }>()
const { t, year, sourceUrl } = useAppFooter()
</script>

<style scoped src="./AppFooter.css"></style>
