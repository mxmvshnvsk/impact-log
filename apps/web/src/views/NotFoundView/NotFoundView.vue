<template>
  <section class="not-found l-content">
    <p class="not-found__line"><span class="not-found__prompt">$</span>cd {{ path }}</p>
    <p class="not-found__line not-found__line--error">cd: {{ t('notFound.title') }}: {{ path }}</p>
    <p class="not-found__line">
      <span class="not-found__prompt">$</span><RouterLink to="/">cd ~</RouterLink>
      <span class="not-found__hint">  # {{ t('notFound.home') }}</span>
    </p>
  </section>
</template>

<script setup lang="ts">
import { useNotFoundView } from './useNotFoundView'

const { t, path } = useNotFoundView()
</script>

<style scoped src="./NotFoundView.css"></style>
