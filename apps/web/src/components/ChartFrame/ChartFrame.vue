<template>
  <UiCard class="chart-frame" :aria-labelledby="titleId">
    <header class="chart-frame__header">
      <div class="chart-frame__heading">
        <h3 :id="titleId" class="chart-frame__title">{{ title }}</h3>
        <p v-if="subtitle" class="chart-frame__subtitle">{{ subtitle }}</p>
      </div>
      <UiButton
        v-if="table.rows.length"
        class="chart-frame__toggle"
        variant="ghost"
        size="sm"
        :aria-pressed="asTable"
        @click="toggle"
      >
        <ChartColumnBig v-if="asTable" :size="16" aria-hidden="true" />
        <Table2 v-else :size="16" aria-hidden="true" />
        {{ asTable ? t('insights.chart.asChart') : t('insights.chart.asTable') }}
      </UiButton>
    </header>

    <div v-show="!asTable" class="chart-frame__body">
      <slot />
    </div>

    <div class="chart-frame__table-wrap" :class="{ 'sr-only': !asTable }">
      <table class="chart-frame__table">
        <caption class="sr-only">{{ title }}</caption>
        <thead>
          <tr>
            <th v-for="column in table.columns" :key="column" scope="col">{{ column }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in table.rows" :key="row.key">
            <template v-for="(cell, index) in row.cells" :key="index">
              <th v-if="index === 0" scope="row">{{ cell }}</th>
              <td v-else>{{ cell }}</td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>

    <footer v-if="$slots.footer" class="chart-frame__footer">
      <slot name="footer" />
    </footer>
  </UiCard>
</template>

<script setup lang="ts">
import { ChartColumnBig, Table2 } from 'lucide-vue-next'
import { UiButton } from '@/ui/UiButton'
import { UiCard } from '@/ui/UiCard'
import { type ChartTable, useChartFrame } from './useChartFrame'

defineProps<{ title: string; subtitle?: string; table: ChartTable }>()
const { t, titleId, asTable, toggle } = useChartFrame()
</script>

<style scoped src="./ChartFrame.css"></style>
