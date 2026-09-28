<template>
  <component :is="EVIDENCE_ICONS[kind] ?? EVIDENCE_ICONS.url" :size="size" aria-hidden="true" />
</template>

<script setup lang="ts">
import type { Evidence } from '@impact-log/core'
import { EVIDENCE_ICONS } from './evidenceIcons'

withDefaults(defineProps<{ kind: Evidence['kind']; size?: number }>(), { size: 16 })
</script>
