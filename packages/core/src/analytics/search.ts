import type { Impact } from '../domain/impact'
import { inPeriod, type Period } from './period'

export type ImpactFilter = {
  query?: string
  period?: Period
  categories?: readonly string[]
  labels?: readonly string[]
  minScore?: number
}

function normalize(text: string): string {
  return text.toLocaleLowerCase().replace(/ё/g, 'е')
}

/** Поиск и фильтры — на клиенте, по расшифрованным данным (сервер ничего не индексирует) */
export function filterImpacts(impacts: readonly Impact[], filter: ImpactFilter): Impact[] {
  const terms = filter.query ? normalize(filter.query).split(/\s+/).filter(Boolean) : []
  return impacts.filter((impact) => {
    if (filter.period && !inPeriod(impact.occurredAt, filter.period)) return false
    if (filter.minScore && impact.impactScore < filter.minScore) return false
    if (filter.categories?.length && !filter.categories.some((c) => impact.categories.includes(c)))
      return false
    if (filter.labels?.length && !filter.labels.every((l) => impact.labels.includes(l)))
      return false
    if (terms.length) {
      const haystack = normalize(
        [
          impact.title,
          impact.description ?? '',
          ...impact.categories,
          ...impact.labels,
          ...(impact.evidence ?? []).map((e) => `${e.title ?? ''} ${e.ref ?? ''} ${e.url ?? ''}`),
          ...(impact.metrics ?? []).map((m) => m.label),
        ].join(' '),
      )
      if (!terms.every((term) => haystack.includes(term))) return false
    }
    return true
  })
}

/** Все используемые категории и метки — для подсказок в форме */
export function vocabulary(impacts: readonly Impact[]) {
  const categories = new Map<string, number>()
  const labels = new Map<string, number>()
  for (const impact of impacts) {
    for (const c of impact.categories) categories.set(c, (categories.get(c) ?? 0) + 1)
    for (const l of impact.labels) labels.set(l, (labels.get(l) ?? 0) + 1)
  }
  const sorted = (map: Map<string, number>) =>
    [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n)
  return { categories: sorted(categories), labels: sorted(labels) }
}
