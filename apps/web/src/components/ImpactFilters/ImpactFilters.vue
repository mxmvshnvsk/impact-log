<template>
  <div class="impact-filters" role="search">
    <div class="impact-filters__top">
      <label class="impact-filters__search">
        <Search class="impact-filters__search-icon" :size="18" aria-hidden="true" />
        <span class="sr-only">{{ t('dashboard.filters.search') }}</span>
        <input
          ref="searchRef"
          class="impact-filters__search-field"
          type="search"
          :value="filters.q"
          :placeholder="t('dashboard.filters.searchPlaceholder')"
          enterkeyhint="search"
          autocomplete="off"
          @input="onSearch"
          @keydown="onSearchKeydown"
        />
        <kbd class="impact-filters__kbd" aria-hidden="true">/</kbd>
      </label>
      <UiButton
        class="impact-filters__toggle"
        variant="secondary"
        :aria-expanded="open"
        :aria-controls="panelId"
        @click="open = !open"
      >
        <SlidersHorizontal :size="16" aria-hidden="true" />
        <span class="sr-only">{{ t('dashboard.filters.toggle') }}</span>
        <span v-if="count" class="impact-filters__badge">{{ count }}</span>
      </UiButton>
    </div>

    <div :id="panelId" class="impact-filters__panel" :class="{ 'impact-filters__panel--open': open || count > 0 }">
      <UiSelect
        size="sm"
        hide-label
        :label="t('dashboard.filters.periodLabel')"
        :options="periodOptions"
        :model-value="filters.period"
        @update:model-value="update({ period: $event as JournalFilters['period'] })"
      />
      <UiSelect
        size="sm"
        hide-label
        :label="t('dashboard.filters.scoreLabel')"
        :options="scoreOptions"
        :model-value="String(filters.minScore)"
        @update:model-value="update({ minScore: Number($event) })"
      />
      <UiSelect
        size="sm"
        hide-label
        :label="t('dashboard.filters.categoryLabel')"
        :options="categoryOptions"
        :model-value="filters.categories[0] ?? ''"
        @update:model-value="update({ categories: $event ? [$event] : [] })"
      />
      <UiSelect
        size="sm"
        hide-label
        :label="t('dashboard.filters.labelLabel')"
        :options="labelOptions"
        :model-value="filters.labels[0] ?? ''"
        @update:model-value="update({ labels: $event ? [$event] : [] })"
      />
    </div>

    <div v-if="filtering" class="impact-filters__summary">
      <p class="impact-filters__found" role="status">
        {{ t('dashboard.filters.found', { found, total }, found) }}
      </p>
      <ul v-if="activeChips.length" class="impact-filters__chips">
        <li v-for="chip in activeChips" :key="chip.key">
          <UiChip
            size="sm"
            :tone="chip.accent ? 'accent' : 'neutral'"
            removable
            :remove-label="t('dashboard.filters.removeChip', { value: chip.text })"
            @remove="chip.remove"
          >
            {{ chip.text }}
          </UiChip>
        </li>
      </ul>
      <UiButton class="impact-filters__reset" variant="ghost" size="sm" @click="reset">
        <X :size="14" aria-hidden="true" />{{ t('dashboard.filters.reset') }}
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Search, SlidersHorizontal, X } from 'lucide-vue-next'
import { UiButton } from '@/ui/UiButton'
import { UiChip } from '@/ui/UiChip'
import { UiSelect } from '@/ui/UiSelect'
import type { JournalFilters } from '@/utils/journalFilters'
import { type ImpactFiltersProps, useImpactFilters } from './useImpactFilters'

const props = defineProps<ImpactFiltersProps>()
const emit = defineEmits<{ 'update:filters': [value: JournalFilters] }>()
const f = useImpactFilters(props, emit)
const { t, panelId, searchRef, open, count, filtering, periodOptions, scoreOptions } = f
const { categoryOptions, labelOptions, activeChips, update, onSearch, onSearchKeydown, reset } = f

defineExpose({ focusSearch: f.focusSearch })
</script>

<style scoped src="./ImpactFilters.css"></style>
