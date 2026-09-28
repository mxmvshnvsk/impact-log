<template>
  <div class="dashboard">
    <header class="dashboard__header">
      <div class="dashboard__heading">
        <h1 class="dashboard__title">{{ t('dashboard.title') }}</h1>
        <p class="dashboard__lead">{{ t('dashboard.lead') }}</p>
        <RouterLink v-if="localOnly" class="dashboard__vault" :to="{ name: 'settings-account' }">
          <ShieldCheck :size="16" aria-hidden="true" />
          <span>{{ t('dashboard.vault.localOnly') }}</span>
          <span class="dashboard__vault-link">{{ t('dashboard.vault.sync') }}</span>
        </RouterLink>
      </div>
      <div class="dashboard__header-actions">
        <span v-if="quota" class="dashboard__quota">{{ quota }}</span>
        <UiButton variant="secondary" :to="{ name: 'impact-new' }">
          <Plus :size="18" aria-hidden="true" />{{ t('dashboard.new') }}
          <kbd class="dashboard__kbd" aria-hidden="true">N</kbd>
        </UiButton>
      </div>
    </header>

    <UiAlert v-if="undecryptable" tone="warning">
      {{ t('dashboard.undecryptable', { n: undecryptable }, undecryptable) }}
    </UiAlert>
    <UiAlert v-if="lastDeleted" tone="info">
      <span class="dashboard__undo">
        <span>{{ t('dashboard.deleted', { title: lastDeleted.title }) }}</span>
        <UiButton size="sm" variant="secondary" :loading="restoring" @click="undoDelete">
          <Undo2 :size="16" aria-hidden="true" />{{ t('dashboard.undo') }}
        </UiButton>
        <UiIconButton class="dashboard__undo-close" :label="t('common.close')" @click="dismissDeleted">
          <X :size="16" aria-hidden="true" />
        </UiIconButton>
      </span>
    </UiAlert>

    <div class="dashboard__layout" :class="{ 'dashboard__layout--empty': ready && !count }">
      <ImpactQuickAdd
        class="dashboard__quick"
        @focus="quickHandlers.focus"
        @blur="quickHandlers.blur"
        @typing="quickHandlers.typing"
        @created="quickHandlers.created"
        @failed="quickHandlers.failed"
      />

      <aside v-if="count" class="dashboard__aside" :aria-label="t('dashboard.aside')">
        <ImpactStats :impacts="impacts" />
        <section v-if="topCategories.length || topLabels.length" class="dashboard__vocab">
          <div v-if="topCategories.length" class="dashboard__vocab-group">
            <h2 class="dashboard__vocab-title">{{ t('dashboard.vocab.categories') }}</h2>
            <ul class="dashboard__vocab-list">
              <li v-for="item in topCategories" :key="item.value">
                <UiChip size="sm" :tone="item.active ? 'accent' : 'neutral'" :to="item.to">
                  {{ item.value }}
                </UiChip>
              </li>
            </ul>
          </div>
          <div v-if="topLabels.length" class="dashboard__vocab-group">
            <h2 class="dashboard__vocab-title">{{ t('dashboard.vocab.labels') }}</h2>
            <ul class="dashboard__vocab-list">
              <li v-for="item in topLabels" :key="item.value">
                <UiChip size="sm" :tone="item.active ? 'accent' : 'neutral'" :to="item.to">
                  #{{ item.value }}
                </UiChip>
              </li>
            </ul>
          </div>
        </section>
      </aside>

      <div class="dashboard__main">
        <div v-if="!ready" class="dashboard__skeleton" :aria-label="t('common.loading')" role="status">
          <span v-for="n in 3" :key="n" class="dashboard__skeleton-card" />
        </div>

        <UiCard v-else-if="!count" class="dashboard__empty" padding="lg">
          <AppMascot
            class="dashboard__mascot"
            :mood="mascot.mood"
            :look="mascot.look"
            :action="mascot.action"
          />
          <div class="dashboard__empty-text">
            <h2 class="dashboard__empty-title">{{ t('dashboard.empty.title') }}</h2>
            <p class="dashboard__empty-lead">{{ t('dashboard.empty.text') }}</p>
            <ul class="dashboard__tips">
              <li><Sparkles :size="16" aria-hidden="true" />{{ t('dashboard.empty.tipQuick') }}</li>
              <li class="dashboard__tip-key"><Keyboard :size="16" aria-hidden="true" />{{ t('dashboard.empty.tipKey') }}</li>
              <li><ShieldCheck :size="16" aria-hidden="true" />{{ t('dashboard.empty.tipPrivate') }}</li>
            </ul>
            <UiButton :to="{ name: 'impact-new' }" variant="secondary">
              <Plus :size="18" aria-hidden="true" />{{ t('dashboard.empty.cta') }}
            </UiButton>
          </div>
        </UiCard>

        <template v-else>
          <ImpactFilters
            ref="filtersRef"
            :filters="filters"
            :vocabulary="vocab"
            :total="count"
            :found="filtered.length"
            @update:filters="setFilters"
          />
          <ImpactFeed v-if="filtered.length" :impacts="filtered" />
          <div v-else class="dashboard__nothing">
            <SearchX :size="28" aria-hidden="true" />
            <p class="dashboard__nothing-title">{{ t('dashboard.nothing.title') }}</p>
            <p class="dashboard__nothing-text">{{ t('dashboard.nothing.text') }}</p>
            <UiButton variant="secondary" size="sm" @click="resetFilters">
              {{ t('dashboard.filters.reset') }}
            </UiButton>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Keyboard, Plus, SearchX, ShieldCheck, Sparkles, Undo2, X } from 'lucide-vue-next'
import { AppMascot } from '@/components/AppMascot'
import { ImpactFeed } from '@/components/ImpactFeed'
import { ImpactFilters } from '@/components/ImpactFilters'
import { ImpactQuickAdd } from '@/components/ImpactQuickAdd'
import { ImpactStats } from '@/components/ImpactStats'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiCard } from '@/ui/UiCard'
import { UiChip } from '@/ui/UiChip'
import { UiIconButton } from '@/ui/UiIconButton'
import { useDashboardView } from './useDashboardView'

const d = useDashboardView()
const { t, ready, count, undecryptable, filters, filtersRef, setFilters, resetFilters } = d
const { filtered, vocab, topCategories, topLabels, impacts, localOnly, quota, mascot } = d
const { quickHandlers, lastDeleted, restoring, undoDelete, dismissDeleted } = d
</script>

<style scoped src="./DashboardView.css"></style>
