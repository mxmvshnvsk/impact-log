import {
  compareImpactsDesc,
  comparePeriods,
  earliestDate,
  filterByPeriod,
  type Impact,
  previousPeriod,
  timeline,
  weeklyStreak,
} from '@impact-log/core'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePeriodQuery } from '@/components/PeriodPicker'
import { useEntitlements } from '@/composables/useEntitlements'
import { useImpacts } from '@/composables/useImpacts'
import { buildObservations } from '@/utils/insightsObservations'
import { localIsoDate, periodGranularity, resolvePeriod } from '@/utils/periodSelection'

const TOP_ENTRIES = 5

export function useInsightsView() {
  const { t } = useI18n()
  const { impacts, ready } = useImpacts()
  const { can } = useEntitlements()
  const { selection } = usePeriodQuery('quarter')
  const today = localIsoDate()

  const all = computed(() => impacts.value as readonly Impact[])
  const earliest = computed(() => earliestDate(all.value))
  const period = computed(() => resolvePeriod(selection.value, today, earliest.value))
  const previous = computed(() => previousPeriod(period.value))
  const comparison = computed(() => comparePeriods(all.value, period.value))
  const granularity = computed(() => periodGranularity(period.value))
  const buckets = computed(() => timeline(all.value, period.value, granularity.value))
  const inPeriod = computed(() => filterByPeriod(all.value, period.value))

  /** Серия на конец периода: записи позже этой даты не считаются (даже если они в той же неделе) */
  const streakAt = (date: string) =>
    weeklyStreak(
      all.value.filter((impact) => impact.occurredAt <= date),
      date,
    )

  const streak = computed(() => ({
    current: streakAt(period.value.to),
    previous: streakAt(previous.value.to),
  }))

  /** Сравнивать есть с чем, только если предыдущий период захватывает историю записей («всё время» — нет) */
  const comparable = computed(
    () => earliest.value !== undefined && previous.value.to >= earliest.value,
  )

  const observations = computed(() =>
    buildObservations({
      impacts: all.value,
      period: period.value,
      comparison: comparison.value,
      buckets: buckets.value,
      granularity: granularity.value,
    }),
  )

  const top = computed(() =>
    [...inPeriod.value]
      .sort((a, b) => b.impactScore - a.impactScore || compareImpactsDesc(a, b))
      .slice(0, TOP_ENTRIES),
  )

  /** Расширенная аналитика — по профилю возможностей, без знания о тарифах */
  const advanced = computed(() => can('advancedAnalytics'))

  const state = computed(() => {
    if (!ready.value) return 'loading'
    if (all.value.length === 0) return 'empty'
    if (inPeriod.value.length === 0) return 'emptyPeriod'
    return 'ready'
  })

  function showAllTime() {
    selection.value = { preset: 'all' }
  }

  return {
    t,
    today,
    selection,
    period,
    previous,
    comparison,
    granularity,
    buckets,
    streak,
    comparable,
    observations,
    top,
    advanced,
    state,
    showAllTime,
  }
}
