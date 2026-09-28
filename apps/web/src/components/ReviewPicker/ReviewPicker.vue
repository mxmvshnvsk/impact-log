<template>
  <div class="review-picker">
    <button
      type="button"
      class="review-picker__toggle"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      <span class="review-picker__toggle-text">
        <span class="review-picker__toggle-title">{{ t('review.picker.title') }}</span>
        <span class="review-picker__summary">{{ summary }}</span>
      </span>
      <ChevronDown class="review-picker__chevron" :class="{ 'review-picker__chevron--open': open }" :size="18" aria-hidden="true" />
    </button>

    <div v-show="open" :id="panelId" class="review-picker__panel">
      <p v-if="!candidates.length" class="review-picker__empty">{{ t('review.picker.noCandidates') }}</p>
      <template v-else>
        <UiInput v-model="query" :label="t('review.picker.search')" name="review-search" autocomplete="off" />
        <div class="review-picker__bulk">
          <UiButton variant="ghost" size="sm" @click="setAll(true)">{{ t('review.picker.all') }}</UiButton>
          <UiButton variant="ghost" size="sm" @click="setAll(false)">{{ t('review.picker.none') }}</UiButton>
        </div>
        <ul v-if="rows.length" class="review-picker__list">
          <li v-for="row in rows" :key="row.id" class="review-picker__item">
            <UiCheckbox :model-value="row.checked" @update:model-value="toggle(row.id, $event)">
              <span class="review-picker__item-title">{{ row.title }}</span>
              <span class="review-picker__item-meta">{{ row.meta }}</span>
            </UiCheckbox>
          </li>
        </ul>
        <p v-else class="review-picker__empty">{{ t('review.picker.notFound') }}</p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { UiButton } from '@/ui/UiButton'
import { UiCheckbox } from '@/ui/UiCheckbox'
import { UiInput } from '@/ui/UiInput'
import { type ReviewPickerProps, useReviewPicker } from './useReviewPicker'

const props = defineProps<ReviewPickerProps>()
const emit = defineEmits<{ 'update:excluded': [value: ReadonlySet<string>] }>()
const { t, panelId, open, query, rows, summary, toggle, setAll } = useReviewPicker(props, emit)
</script>

<style scoped src="./ReviewPicker.css"></style>
