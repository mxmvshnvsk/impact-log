<template>
  <UiCard
    v-if="items.length"
    :id="ANCHOR"
    class="conflicts-panel"
    padding="lg"
    aria-labelledby="conflicts-panel-title"
  >
    <header class="conflicts-panel__header">
      <h2 id="conflicts-panel-title" ref="titleRef" class="conflicts-panel__title" tabindex="-1">
        {{ t('sync.conflicts.title') }}
        <span class="conflicts-panel__count">{{ items.length }}</span>
      </h2>
      <p class="conflicts-panel__lead">{{ t('sync.conflicts.description') }}</p>
    </header>

    <UiAlert v-if="error" tone="danger">{{ error }}</UiAlert>

    <article v-for="item in items" :key="item.objectId" class="conflicts-panel__item">
      <div class="conflicts-panel__sides">
        <section
          v-for="side in item.sides"
          :key="side.key"
          class="conflicts-panel__side"
          :class="`conflicts-panel__side--${side.key}`"
        >
          <h3 class="conflicts-panel__caption">{{ side.caption }}</h3>
          <p v-if="side.changed" class="conflicts-panel__meta">{{ side.changed }}</p>
          <p v-if="side.note" class="conflicts-panel__note">{{ side.note }}</p>
          <dl v-else class="conflicts-panel__fields">
            <div
              v-for="field in side.fields"
              :key="field.key"
              class="conflicts-panel__field"
              :class="{ 'conflicts-panel__field--diff': field.diff }"
            >
              <dt class="conflicts-panel__label">
                {{ field.label }}
                <span v-if="field.diff" class="conflicts-panel__differs">
                  {{ t('sync.conflicts.differs') }}
                </span>
              </dt>
              <dd class="conflicts-panel__value">
                <ScoreBadge v-if="field.score !== null" :score="field.score" size="sm" />
                <template v-else>{{ field.text }}</template>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <div
        v-if="item.actions.some((action) => action.id === confirming)"
        class="conflicts-panel__confirm"
        role="alertdialog"
        :aria-label="t('sync.conflicts.confirmDelete')"
      >
        <p class="conflicts-panel__confirm-text">{{ t('sync.conflicts.confirmDelete') }}</p>
        <div class="conflicts-panel__actions">
          <template v-for="action in item.actions" :key="action.id">
            <UiButton
              v-if="action.id === confirming"
              variant="danger"
              size="sm"
              @click="choose(item, action, true)"
            >
              {{ action.label }}
            </UiButton>
          </template>
          <UiButton variant="ghost" size="sm" @click="cancelConfirm">
            {{ t('sync.conflicts.cancel') }}
          </UiButton>
        </div>
      </div>
      <div v-else class="conflicts-panel__actions">
        <UiButton
          v-for="action in item.actions"
          :key="action.id"
          :variant="action.variant"
          size="sm"
          :loading="busy === action.id"
          :disabled="busy !== null && busy !== action.id"
          @click="choose(item, action)"
        >
          {{ action.label }}
        </UiButton>
      </div>
    </article>
  </UiCard>
</template>

<script setup lang="ts">
import { ScoreBadge } from '@/components/ScoreBadge'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiCard } from '@/ui/UiCard'
import { ANCHOR, useConflictsPanel } from './useConflictsPanel'

const { t, items, busy, confirming, error, choose, cancelConfirm, titleRef } = useConflictsPanel()
</script>

<style scoped src="./ConflictsPanel.css"></style>
