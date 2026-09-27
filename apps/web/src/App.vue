<template>
  <component :is="layout">
    <RouterView />
  </component>
</template>

<script setup lang="ts">
import { useLayoutResolver } from './useLayoutResolver'

const { layout } = useLayoutResolver()
</script>
