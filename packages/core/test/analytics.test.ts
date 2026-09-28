import { describe, expect, it } from 'vitest'
import {
  buildReview,
  comparePeriods,
  createImpact,
  DEFAULT_REVIEW_OPTIONS,
  exportCsv,
  exportJson,
  filterImpacts,
  type Impact,
  importJson,
  percent,
  presetPeriod,
  previousPeriod,
  renderReviewMarkdown,
  round,
  startOfWeek,
  summarize,
  timeline,
  weeklyStreak,
} from '../src'

function impact(
  occurredAt: string,
  impactScore: number,
  categories: string[],
  labels: string[] = [],
  extra = {},
): Impact {
  return createImpact({
    title: `${occurredAt} ${impactScore}`,
    occurredAt,
    impactScore,
    categories,
    labels,
    ...extra,
  })
}

const data = [
  impact('2026-01-10', 5, ['Платформа'], ['perf'], {
    metrics: [{ label: 'build', value: 2, baseline: 6, unit: 'мин' }],
  }),
  impact('2026-01-20', 3, ['Найм'], ['hiring']),
  impact('2026-02-02', 4, ['Платформа', 'Менторство'], ['perf', 'mentoring'], {
    evidence: [{ kind: 'pr', url: 'https://github.com/o/r/pull/1', ref: '#1' }],
  }),
  impact('2026-02-15', 2, [], []),
  impact('2026-03-01', 4, ['Платформа'], ['ci']),
]

describe('Детерминированная математика', () => {
  it('округление половины — от нуля, проценты', () => {
    expect(round(2.25, 1)).toBe(2.3)
    expect(round(-2.25, 1)).toBe(-2.3)
    expect(percent(1, 3)).toBe(33.3)
    expect(percent(2, 3)).toBe(66.7)
    expect(percent(1, 0)).toBe(0)
  })
})

describe('Сводка', () => {
  it('счётчики, доли, распределения', () => {
    const s = summarize(data)
    expect(s.total).toBe(5)
    expect(s.averageScore).toBe(3.6)
    expect(s.highImpactCount).toBe(3)
    expect(s.highImpactShare).toBe(60)
    expect(s.withMetricsShare).toBe(20)
    expect(s.withEvidenceShare).toBe(20)
    expect(s.scoreDistribution.map((d) => d.count)).toEqual([0, 1, 1, 2, 1])
    expect(s.categories[0]).toEqual({ name: 'Платформа', count: 3, share: 60 })
    expect(s.labels[0]).toEqual({ name: 'perf', count: 2, share: 40 })
  })

  it('пустой набор', () => {
    const s = summarize([])
    expect(s.total).toBe(0)
    expect(s.averageScore).toBeNull()
    expect(s.highImpactShare).toBe(0)
  })
})

describe('Периоды и динамика', () => {
  it('пресеты и предыдущий период', () => {
    expect(presetPeriod('month', '2026-03-31')).toEqual({ from: '2026-03-02', to: '2026-03-31' })
    expect(previousPeriod({ from: '2026-03-01', to: '2026-03-31' })).toEqual({
      from: '2026-01-29',
      to: '2026-02-28',
    })
    expect(startOfWeek('2026-03-01')).toBe('2026-02-23') // воскресенье → понедельник
  })

  it('помесячная разбивка с пустыми месяцами', () => {
    const t = timeline(data, { from: '2026-01-01', to: '2026-04-30' }, 'month')
    expect(t.map((b) => [b.start, b.count])).toEqual([
      ['2026-01-01', 2],
      ['2026-02-01', 2],
      ['2026-03-01', 1],
      ['2026-04-01', 0],
    ])
  })

  it('серия недель', () => {
    const weekly = [
      impact('2026-03-02', 3, []),
      impact('2026-03-09', 3, []),
      impact('2026-03-16', 3, []),
    ]
    expect(weeklyStreak(weekly, '2026-03-18')).toBe(3)
    expect(weeklyStreak(weekly, '2026-03-25')).toBe(3) // текущая неделя без записи не рвёт серию
    expect(weeklyStreak(weekly, '2026-04-01')).toBe(0)
  })

  it('сравнение периодов', () => {
    const c = comparePeriods(data, { from: '2026-02-01', to: '2026-03-31' })
    expect(c.current.total).toBe(3)
    expect(c.previous.total).toBe(2)
    expect(c.countDelta).toBe(1)
    expect(c.countChange).toBe(50)
  })
})

describe('Поиск', () => {
  it('по тексту (ё=е), меткам, минимальной оценке', () => {
    expect(filterImpacts(data, { labels: ['perf'] })).toHaveLength(2)
    expect(filterImpacts(data, { minScore: 4 })).toHaveLength(3)
    expect(filterImpacts(data, { query: 'ПЛАТФОРМА' })).toHaveLength(3)
    expect(filterImpacts(data, { query: '#1' })).toHaveLength(1)
  })
})

describe('Отчёт для ревью и экспорт', () => {
  const report = buildReview(data, {
    ...DEFAULT_REVIEW_OPTIONS,
    period: { from: '2026-01-01', to: '2026-03-31' },
    locale: 'ru',
    highlights: 2,
  })

  it('ключевые результаты — по оценке', () => {
    expect(report.highlights.map((i) => i.impactScore)).toEqual([5, 4])
    expect(report.groups[0]?.name).toBe('Платформа')
  })

  it('markdown содержит цифры, посчитанные кодом', () => {
    const md = renderReviewMarkdown(report)
    expect(md).toContain('- Записей: 5')
    expect(md).toContain('- Высокое влияние (4–5): 3 (60%)')
    expect(md).toContain('build: 6 → 2 мин (-4)')
    expect(md).toContain('[#1](https://github.com/o/r/pull/1)')
    expect(md).toContain('## Без категории')
  })

  it('JSON-экспорт импортируется обратно без потерь', () => {
    const { impacts, skipped } = importJson(exportJson(data))
    expect(skipped).toBe(0)
    expect(new Set(impacts.map((i) => i.objectId))).toEqual(new Set(data.map((i) => i.objectId)))
  })

  it('CSV экранирует запятые и кавычки', () => {
    const csv = exportCsv([impact('2026-01-01', 3, ['a, b'], [], { description: 'say "hi"' })])
    expect(csv.split('\n')[1]).toContain('"a, b"')
    expect(csv).toContain('"say ""hi"""')
  })
})
