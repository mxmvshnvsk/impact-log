import { HIGH_IMPACT_SCORE, type Impact, percent, todayIso, weeklyStreak } from '@impact-log/core'
import { CalendarDays, Flame, NotebookPen, Zap } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatNumber } from '@/utils/numbers'

/** Полоска статистики журнала: всего, за месяц, недель подряд, доля сильных (4–5) */
export function useImpactStats(props: { impacts: readonly Impact[] }) {
  const { t, locale } = useI18n()

  const stats = computed(() => {
    const today = todayIso()
    const month = today.slice(0, 7)
    let thisMonth = 0
    let high = 0
    for (const impact of props.impacts) {
      if (impact.occurredAt.startsWith(month)) thisMonth++
      if (impact.impactScore >= HIGH_IMPACT_SCORE) high++
    }
    const total = props.impacts.length
    const streak = weeklyStreak(props.impacts, today)
    return [
      { key: 'total', icon: NotebookPen, value: formatNumber(total, locale.value) },
      { key: 'month', icon: CalendarDays, value: formatNumber(thisMonth, locale.value) },
      {
        key: 'streak',
        icon: Flame,
        value: formatNumber(streak, locale.value),
        hint: t('dashboard.stats.streakHint'),
      },
      {
        key: 'high',
        icon: Zap,
        value: total ? `${formatNumber(Math.round(percent(high, total)), locale.value)}%` : '—',
        hint: t('dashboard.stats.highHint', { n: high }, high),
      },
    ]
  })

  return { t, stats }
}
