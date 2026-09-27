<template>
  <div class="ui-alert" :class="`ui-alert--${tone}`" :role="tone === 'danger' ? 'alert' : 'status'">
    <component :is="icon" class="ui-alert__icon" :size="18" aria-hidden="true" />
    <div class="ui-alert__body"><slot /></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { alertIcon } from './alertIcon'

const props = withDefaults(defineProps<{ tone?: 'danger' | 'warning' | 'info' | 'success' }>(), {
  tone: 'info',
})
const icon = computed(() => alertIcon(props.tone))
</script>

<style scoped src="./UiAlert.css"></style>
