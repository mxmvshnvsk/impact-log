<template>
  <section class="home">
    <p class="home__eyebrow">// {{ t('home.eyebrow') }}</p>
    <h1 class="home__title">{{ t('home.title') }}</h1>
    <p class="home__subtitle l-content">{{ t('home.subtitle') }}</p>

    <div class="home__terminal l-content">
      <div class="home__terminal-bar" aria-hidden="true">guest@impact-log: ~</div>
      <div class="home__terminal-body" aria-live="off">
        <p
          v-for="(line, index) in lines"
          :key="index"
          class="home__line"
          :class="[`home__line--${line.kind}`, line.kind === 'output' && line.tone && `home__line--${line.tone}`]"
        >
          <span v-if="line.kind === 'command'" class="home__prompt">$</span>{{ line.text }}<span
            v-if="!line.done"
            class="home__caret"
            aria-hidden="true"
            >_</span
          >
        </p>
        <p v-if="done" class="home__line home__line--command">
          <span class="home__prompt">$</span><ApiStatus />
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ApiStatus } from '@/components/ApiStatus'
import { useHomeView } from './useHomeView'

const { t, lines, done } = useHomeView()
</script>

<style scoped src="./HomeView.css"></style>
