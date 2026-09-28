<template>
  <div class="review-settings">
    <UiInput
      :model-value="title"
      :label="t('review.settings.title')"
      :placeholder="titlePlaceholder"
      :maxlength="120"
      name="review-title"
      autocomplete="off"
      @update:model-value="emit('update:title', $event)"
    />

    <div class="review-settings__field">
      <span class="review-settings__label">{{ t('review.settings.group.label') }}</span>
      <UiSegmented
        :model-value="preferences.groupBy"
        :options="groupOptions"
        :label="t('review.settings.group.label')"
        size="sm"
        block
        @update:model-value="onGroup"
      />
    </div>

    <div class="review-settings__row">
      <UiSelect
        :model-value="String(preferences.minScore)"
        :options="scoreOptions"
        :label="t('review.settings.minScore')"
        @update:model-value="onMinScore"
      />
      <UiSelect
        :model-value="String(preferences.highlights)"
        :options="highlightOptions"
        :label="t('review.settings.highlights')"
        @update:model-value="onHighlights"
      />
    </div>

    <fieldset class="review-settings__fieldset">
      <legend class="review-settings__label">{{ t('review.settings.include') }}</legend>
      <UiCheckbox
        v-for="key in includes"
        :key="key"
        :model-value="preferences[key]"
        @update:model-value="onInclude(key, $event)"
      >
        {{ t(`review.settings.${key}`) }}
      </UiCheckbox>
    </fieldset>

    <div class="review-settings__field">
      <span class="review-settings__label">{{ t('review.settings.locale') }}</span>
      <UiSegmented
        :model-value="reportLocale"
        :options="localeOptions"
        :label="t('review.settings.locale')"
        size="sm"
        block
        @update:model-value="onLocale"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { UiCheckbox } from '@/ui/UiCheckbox'
import { UiInput } from '@/ui/UiInput'
import { UiSegmented } from '@/ui/UiSegmented'
import { UiSelect } from '@/ui/UiSelect'
import {
  type ReviewSettingsEmits,
  type ReviewSettingsProps,
  useReviewSettings,
} from './useReviewSettings'

const props = defineProps<ReviewSettingsProps>()
const emit = defineEmits<ReviewSettingsEmits>()
const {
  t,
  includes,
  groupOptions,
  scoreOptions,
  highlightOptions,
  localeOptions,
  titlePlaceholder,
  onGroup,
  onMinScore,
  onHighlights,
  onInclude,
  onLocale,
} = useReviewSettings(props, emit)
</script>

<style scoped src="./ReviewSettings.css"></style>
