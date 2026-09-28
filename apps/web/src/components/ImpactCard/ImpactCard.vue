<template>
  <article class="impact-card" :class="{ 'impact-card--high': high, 'impact-card--conflict': conflict }">
    <div class="impact-card__top">
      <p class="impact-card__meta">
        <time class="impact-card__date" :datetime="impact.occurredAt">{{ date }}</time>
        <span v-if="conflict" class="impact-card__conflict">
          <GitMergeConflict :size="13" aria-hidden="true" />{{ t('impacts.card.conflict') }}
        </span>
      </p>
      <ScoreBadge :score="impact.impactScore" size="sm" />
    </div>
    <h3 class="impact-card__title">
      <RouterLink class="impact-card__link" :to="{ name: 'impact', params: { id: impact.objectId } }">
        {{ impact.title }}
      </RouterLink>
    </h3>
    <ul v-if="metrics.length" class="impact-card__metrics">
      <li v-for="(metric, index) in metrics" :key="index" class="impact-card__metric">
        <component :is="metric.down ? TrendingDown : TrendingUp" :size="15" aria-hidden="true" />
        <span class="impact-card__metric-label">{{ metric.label }}</span>
        <span class="impact-card__metric-value">{{ metric.value }}</span>
        <span v-if="metric.delta" class="impact-card__metric-delta">{{ metric.delta }}</span>
      </li>
    </ul>
    <div v-if="chips.visible.length || evidence.count" class="impact-card__bottom">
      <ul v-if="chips.visible.length" class="impact-card__chips">
        <li v-for="chip in chips.visible" :key="chip.key">
          <UiChip size="sm" :tone="chip.accent ? 'accent' : 'neutral'">{{ chip.text }}</UiChip>
        </li>
        <li v-if="chips.rest">
          <UiChip size="sm">+{{ chips.rest }}</UiChip>
        </li>
      </ul>
      <span
        v-if="evidence.count"
        class="impact-card__evidence"
        role="img"
        :aria-label="t('impacts.card.evidence', { n: evidence.count }, evidence.count)"
        :title="t('impacts.card.evidence', { n: evidence.count }, evidence.count)"
      >
        <EvidenceIcon v-for="kind in evidence.kinds" :key="kind" :kind="kind" :size="15" />
        <span aria-hidden="true">{{ evidence.count }}</span>
      </span>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { Impact } from '@impact-log/core'
import { GitMergeConflict, TrendingDown, TrendingUp } from 'lucide-vue-next'
import { EvidenceIcon } from '@/components/EvidenceIcon'
import { ScoreBadge } from '@/components/ScoreBadge'
import { UiChip } from '@/ui/UiChip'
import { useImpactCard } from './useImpactCard'

/** conflict — у записи есть неразрешённый конфликт версий синхронизации */
const props = defineProps<{ impact: Impact; conflict?: boolean }>()
const { t, date, chips, metrics, evidence, high } = useImpactCard(props)
</script>

<style scoped src="./ImpactCard.css"></style>
