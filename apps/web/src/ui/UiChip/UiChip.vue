<template>
  <span class="ui-chip" :class="[`ui-chip--${tone}`, `ui-chip--${size}`, { 'ui-chip--removable': removable }]">
    <RouterLink v-if="to" :to="to" class="ui-chip__body ui-chip__body--link"><slot /></RouterLink>
    <span v-else class="ui-chip__body"><slot /></span>
    <button
      v-if="removable"
      type="button"
      class="ui-chip__remove"
      :aria-label="removeLabel ?? t('ui.chip.remove')"
      :title="removeLabel ?? t('ui.chip.remove')"
      @click="emit('remove')"
    >
      <X :size="14" aria-hidden="true" />
    </button>
  </span>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { type RouteLocationRaw, RouterLink } from 'vue-router'

withDefaults(
  defineProps<{
    tone?: 'neutral' | 'accent'
    size?: 'sm' | 'md'
    removable?: boolean
    /** Подпись кнопки удаления: «Убрать метку perf» */
    removeLabel?: string
    /** Чип-ссылка (например, фильтр журнала по метке) */
    to?: RouteLocationRaw
  }>(),
  { tone: 'neutral', size: 'md' },
)
const emit = defineEmits<{ remove: [] }>()
const { t } = useI18n()
</script>

<style scoped src="./UiChip.css"></style>
