<template>
  <section class="not-found" aria-labelledby="not-found-title">
    <h1 id="not-found-title" class="sr-only">{{ t('notFound.title') }}</h1>
    <UiCard class="not-found__terminal" padding="lg">
      <p class="not-found__line"><span class="not-found__prompt">$</span>cd {{ path }}</p>
      <p class="not-found__line not-found__line--error">cd: {{ t('notFound.error') }}: {{ path }}</p>
      <p class="not-found__line">
        <span class="not-found__prompt">$</span><RouterLink to="/">cd ~</RouterLink>
        <span class="not-found__hint">  # {{ t('notFound.home') }}</span>
      </p>
    </UiCard>
  </section>
</template>

<script setup lang="ts">
import { UiCard } from '@/ui/UiCard'
import { useNotFoundView } from './useNotFoundView'

const { t, path } = useNotFoundView()
</script>

<style scoped src="./NotFoundView.css"></style>
