<template>
  <div class="impact-view l-content">
    <nav class="impact-view__nav" :aria-label="t('impacts.view.navLabel')">
      <RouterLink class="impact-view__back" :to="{ name: 'dashboard' }">
        <ArrowLeft :size="16" aria-hidden="true" />{{ t('impacts.view.back') }}
      </RouterLink>
      <div v-if="impact" class="impact-view__pager">
        <UiIconButton
          :label="t('impacts.view.newer')"
          :to="impactRoute(neighbors.newer)"
          :disabled="!neighbors.newer"
          replace
        >
          <ChevronLeft :size="20" aria-hidden="true" />
        </UiIconButton>
        <UiIconButton
          :label="t('impacts.view.older')"
          :to="impactRoute(neighbors.older)"
          :disabled="!neighbors.older"
          replace
        >
          <ChevronRight :size="20" aria-hidden="true" />
        </UiIconButton>
      </div>
    </nav>

    <div v-if="!ready" class="impact-view__loading" role="status">
      <UiSpinner :size="24" /><span class="sr-only">{{ t('common.loading') }}</span>
    </div>
    <ImpactMissing v-else-if="!impact" />

    <article v-else class="impact-view__article" aria-labelledby="impact-title">
      <UiAlert v-if="conflict" tone="warning">
        <div class="impact-view__conflict">
          <p class="impact-view__conflict-title">{{ t('impacts.view.conflictTitle') }}</p>
          <p>{{ t('impacts.view.conflictText') }}</p>
          <UiButton class="impact-view__conflict-action" variant="secondary" size="sm" :to="conflictRoute">
            {{ t('impacts.view.conflictAction') }}<ArrowRight :size="16" aria-hidden="true" />
          </UiButton>
        </div>
      </UiAlert>
      <header class="impact-view__header">
        <p v-if="date" class="impact-view__date">
          <CalendarDays :size="16" aria-hidden="true" />
          <time :datetime="impact.occurredAt">{{ date.long }}</time>
          <span class="impact-view__weekday">· {{ date.weekday }}</span>
        </p>
        <h1 id="impact-title" class="impact-view__title">{{ impact.title }}</h1>
        <div class="impact-view__tags">
          <ScoreBadge :score="impact.impactScore" show-label />
          <UiChip v-for="item in categories" :key="`c:${item.value}`" tone="accent" :to="item.to">
            {{ item.value }}
          </UiChip>
          <UiChip v-for="item in labels" :key="`l:${item.value}`" :to="item.to">#{{ item.value }}</UiChip>
        </div>
        <div class="impact-view__actions">
          <UiButton variant="secondary" size="sm" :to="editRoute">
            <Pencil :size="16" aria-hidden="true" />{{ t('common.edit') }}
          </UiButton>
          <UiButton variant="ghost" size="sm" :to="duplicateRoute">
            <Copy :size="16" aria-hidden="true" />{{ t('impacts.view.duplicate') }}
          </UiButton>
          <UiButton class="impact-view__delete" variant="ghost" size="sm" @click="deleteOpen = true">
            <Trash2 :size="16" aria-hidden="true" />{{ t('common.delete') }}
          </UiButton>
        </div>
      </header>

      <section v-if="impact.description" class="impact-view__section" aria-labelledby="impact-description">
        <h2 id="impact-description" class="sr-only">{{ t('impacts.form.description') }}</h2>
        <MarkdownView :source="impact.description" />
      </section>

      <section v-if="metrics.length" class="impact-view__section" aria-labelledby="impact-metrics">
        <h2 id="impact-metrics" class="impact-view__h2">{{ t('impacts.form.metrics') }}</h2>
        <ul class="impact-view__metrics">
          <li v-for="(metric, index) in metrics" :key="index" class="impact-view__metric">
            <p class="impact-view__metric-label">{{ metric.label }}</p>
            <p class="impact-view__metric-value">
              <template v-if="metric.baseline !== null">
                <span class="impact-view__metric-before">{{ metric.baseline }}</span>
                <ArrowRight :size="18" aria-hidden="true" />
                <span class="sr-only">→</span>
              </template>
              <span>{{ metric.value }}</span>
              <span v-if="metric.unit" class="impact-view__metric-unit">{{ metric.unit }}</span>
            </p>
            <p v-if="metric.delta" class="impact-view__metric-delta">
              <component :is="metric.down ? TrendingDown : TrendingUp" :size="15" aria-hidden="true" />
              {{ metric.delta }}<template v-if="metric.percent"> · {{ metric.percent }}</template>
            </p>
          </li>
        </ul>
      </section>

      <section v-if="evidence.length" class="impact-view__section" aria-labelledby="impact-evidence">
        <h2 id="impact-evidence" class="impact-view__h2">{{ t('impacts.form.evidence') }}</h2>
        <ul class="impact-view__evidence">
          <li v-for="item in evidence" :key="item.key" class="impact-view__evidence-item">
            <span class="impact-view__evidence-icon" :title="t(`impacts.evidence.kinds.${item.kind}`)">
              <EvidenceIcon :kind="item.kind" :size="18" />
              <span class="sr-only">{{ t(`impacts.evidence.kinds.${item.kind}`) }}:</span>
            </span>
            <div class="impact-view__evidence-body">
              <a
                v-if="item.href"
                class="impact-view__evidence-link"
                :href="item.href"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ item.primary }}<ExternalLink :size="14" aria-hidden="true" />
              </a>
              <p v-else-if="item.primary" class="impact-view__evidence-text">{{ item.primary }}</p>
              <p v-if="item.href || item.ref" class="impact-view__evidence-meta">
                <span v-if="item.ref" class="impact-view__evidence-ref">{{ item.ref }}</span>
                <span v-if="item.href">{{ item.url }}</span>
              </p>
              <blockquote v-if="item.excerpt" class="impact-view__evidence-excerpt">{{ item.excerpt }}</blockquote>
            </div>
          </li>
        </ul>
      </section>

      <footer v-if="meta" class="impact-view__meta">
        <span>{{ t('impacts.view.created', { date: meta.created }) }}</span>
        <span v-if="meta.updated">{{ t('impacts.view.updated', { date: meta.updated }) }}</span>
        <span class="impact-view__hint">{{ t('impacts.view.shortcuts') }}</span>
      </footer>
    </article>

    <UiDialog
      :open="deleteOpen"
      :title="t('impacts.delete.title')"
      :description="t('impacts.delete.text')"
      :confirm-label="t('impacts.delete.confirm')"
      :cancel-label="t('common.cancel')"
      tone="danger"
      :loading="deleting"
      @confirm="confirmDelete"
      @cancel="deleteOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Pencil,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-vue-next'
import { EvidenceIcon } from '@/components/EvidenceIcon'
import { ImpactMissing } from '@/components/ImpactMissing'
import { MarkdownView } from '@/components/MarkdownView'
import { ScoreBadge } from '@/components/ScoreBadge'
import { UiAlert } from '@/ui/UiAlert'
import { UiButton } from '@/ui/UiButton'
import { UiChip } from '@/ui/UiChip'
import { UiDialog } from '@/ui/UiDialog'
import { UiIconButton } from '@/ui/UiIconButton'
import { UiSpinner } from '@/ui/UiSpinner'
import { useImpactView } from './useImpactView'

const v = useImpactView()
const { t, ready, impact, date, categories, labels, metrics, evidence, meta, neighbors } = v
const { editRoute, duplicateRoute, impactRoute, deleteOpen, deleting, confirmDelete } = v
const { conflict, conflictRoute } = v
</script>

<style scoped src="./ImpactView.css"></style>
