<template>
  <!-- HTML прошёл DOMPurify в utils/markdown -->
  <div class="markdown-view" :class="{ 'markdown-view--compact': compact }" v-html="html" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'

const props = withDefaults(
  defineProps<{
    source: string
    /** Сдвиг уровней заголовков (по умолчанию «#» → h3: на странице уже есть h1 и h2) */
    headingOffset?: number
    /** Плотнее: меньше отступы и кегль заголовков (карточки, превью) */
    compact?: boolean
  }>(),
  { headingOffset: 2 },
)
const html = computed(() => renderMarkdown(props.source, props.headingOffset))
</script>

<!-- не scoped: стили для HTML из v-html; всё под .markdown-view -->
<style src="./MarkdownView.css"></style>
