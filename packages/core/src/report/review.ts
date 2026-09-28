import type { Period } from '../analytics/period'
import { filterByPeriod, type ImpactSummary, summarize } from '../analytics/summary'
import { compareImpactsDesc, type Impact } from '../domain/impact'
import { metricDelta } from '../domain/metric'
import { REPORT_STRINGS, type ReportLocale } from './strings'

export type ReviewGrouping = 'category' | 'month' | 'none'

export type ReviewOptions = {
  period: Period
  locale: ReportLocale
  title?: string
  groupBy: ReviewGrouping
  /** Только записи с оценкой не ниже */
  minScore: number
  /** Сколько записей выносить в «Ключевые результаты» */
  highlights: number
  includeDescriptions: boolean
  includeMetrics: boolean
  includeEvidence: boolean
  /** Явно выбранные записи (если заданы — только они) */
  selectedIds?: readonly string[]
}

export const DEFAULT_REVIEW_OPTIONS: Omit<ReviewOptions, 'period' | 'locale'> = {
  groupBy: 'category',
  minScore: 1,
  highlights: 5,
  includeDescriptions: true,
  includeMetrics: true,
  includeEvidence: true,
}

export type ReviewGroup = { name: string; impacts: Impact[] }

export type ReviewReport = {
  options: ReviewOptions
  summary: ImpactSummary
  highlights: Impact[]
  groups: ReviewGroup[]
}

/** Отбор и группировка записей для ревью — чистая функция */
export function buildReview(impacts: readonly Impact[], options: ReviewOptions): ReviewReport {
  const strings = REPORT_STRINGS[options.locale]
  const selected = filterByPeriod(impacts, options.period)
    .filter((i) => i.impactScore >= options.minScore)
    .filter((i) => !options.selectedIds || options.selectedIds.includes(i.objectId))
    .sort(compareImpactsDesc)

  const highlights = [...selected]
    .sort((a, b) => b.impactScore - a.impactScore || compareImpactsDesc(a, b))
    .slice(0, options.highlights)

  let groups: ReviewGroup[]
  if (options.groupBy === 'category') {
    const map = new Map<string, Impact[]>()
    for (const impact of selected) {
      const keys = impact.categories.length ? impact.categories : [strings.uncategorized]
      for (const key of keys) map.set(key, [...(map.get(key) ?? []), impact])
    }
    groups = [...map.entries()]
      .map(([name, items]) => ({ name, impacts: items }))
      .sort((a, b) => b.impacts.length - a.impacts.length || a.name.localeCompare(b.name))
  } else if (options.groupBy === 'month') {
    const map = new Map<string, Impact[]>()
    for (const impact of selected) {
      const key = impact.occurredAt.slice(0, 7)
      map.set(key, [...(map.get(key) ?? []), impact])
    }
    groups = [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, items]) => {
        const month = strings.months[Number(key.slice(5, 7)) - 1] ?? key
        return { name: `${month} ${key.slice(0, 4)}`, impacts: items }
      })
  } else {
    groups = [{ name: strings.all, impacts: selected }]
  }

  return { options, summary: summarize(selected), highlights, groups }
}

const INTL_LOCALES: Record<ReviewOptions['locale'], string> = { ru: 'ru-RU', en: 'en-US' }

/** Числа — по правилам языка отчёта (3,38 в ru, 3.38 в en), не больше двух знаков после запятой */
function formatNumber(value: number, locale: ReviewOptions['locale']): string {
  return new Intl.NumberFormat(INTL_LOCALES[locale], { maximumFractionDigits: 2 }).format(value)
}

/** Дата события YYYY-MM-DD → «12 мар. 2026 г.» / «Mar 12, 2026» (UTC — дата без часового пояса) */
function formatDate(iso: string, locale: ReviewOptions['locale']): string {
  const date = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function renderImpact(impact: Impact, options: ReviewOptions): string[] {
  const s = REPORT_STRINGS[options.locale]
  const lines = [
    `- **${impact.title}** — ${formatDate(impact.occurredAt, options.locale)} · ${s.score}: ${impact.impactScore}/5`,
  ]
  if (options.includeDescriptions && impact.description) {
    for (const line of impact.description.split('\n')) lines.push(`  ${line}`)
  }
  if (options.includeMetrics && impact.metrics?.length) {
    const parts = impact.metrics.map((m) => {
      const delta = metricDelta(m)
      const unit = m.unit ? ` ${m.unit}` : ''
      const n = (value: number) => formatNumber(value, options.locale)
      return m.baseline === undefined
        ? `${m.label}: ${n(m.value)}${unit}`
        : `${m.label}: ${n(m.baseline)} → ${n(m.value)}${unit} (${delta !== null && delta > 0 ? '+' : ''}${n(delta ?? 0)})`
    })
    lines.push(`  - ${s.metrics}: ${parts.join('; ')}`)
  }
  if (options.includeEvidence && impact.evidence?.length) {
    const links = impact.evidence.map((e) => {
      const label = e.title ?? e.ref ?? e.url ?? e.kind
      return e.url ? `[${label}](${e.url})` : label
    })
    lines.push(`  - ${s.evidence}: ${links.join(', ')}`)
  }
  if (impact.labels.length) lines.push(`  - ${impact.labels.map((l) => `#${l}`).join(' ')}`)
  return lines
}

/** Отчёт в Markdown — вставляется в self-review, документ для грейда, резюме */
export function renderReviewMarkdown(report: ReviewReport): string {
  const { options, summary } = report
  const s = REPORT_STRINGS[options.locale]
  const out: string[] = [
    `# ${options.title ?? s.title}`,
    '',
    `${s.period}: ${formatDate(options.period.from, options.locale)} — ${formatDate(options.period.to, options.locale)}`,
    '',
  ]
  if (summary.total === 0) {
    out.push(s.noEntries, '')
    return out.join('\n')
  }
  const n = (value: number) => formatNumber(value, options.locale)
  out.push(
    `## ${s.summary}`,
    '',
    `- ${s.total}: ${summary.total}`,
    `- ${s.average}: ${summary.averageScore === null ? '—' : n(summary.averageScore)}`,
    `- ${s.high}: ${summary.highImpactCount} (${n(summary.highImpactShare)}%)`,
    `- ${s.withMetrics}: ${n(summary.withMetricsShare)}%`,
    `- ${s.withEvidence}: ${n(summary.withEvidenceShare)}%`,
    '',
  )
  if (summary.categories.length) {
    out.push(`### ${s.categories}`, '')
    for (const c of summary.categories) out.push(`- ${c.name}: ${c.count} (${n(c.share)}%)`)
    out.push('')
  }
  if (summary.labels.length) {
    out.push(`### ${s.topLabels}`, '')
    out.push(
      summary.labels
        .slice(0, 10)
        .map((l) => `#${l.name} (${l.count})`)
        .join(' · '),
      '',
    )
  }
  if (report.highlights.length) {
    out.push(`## ${s.highlights}`, '')
    for (const impact of report.highlights) out.push(...renderImpact(impact, options))
    out.push('')
  }
  for (const group of report.groups) {
    out.push(`## ${group.name}`, '')
    for (const impact of group.impacts) out.push(...renderImpact(impact, options))
    out.push('')
  }
  out.push('---', `_${s.generated}_`, '')
  return out.join('\n')
}
