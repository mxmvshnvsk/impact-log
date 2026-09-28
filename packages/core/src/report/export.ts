import { z } from 'zod'
import { compareImpactsDesc, type Impact, migrateImpact } from '../domain/impact'

/**
 * Экспорт, позволяющий уйти из продукта (ADR-0005, §13): открытый JSON со схемой и версиями,
 * плюс CSV для таблиц. Доступен всегда, на любом тарифе.
 */
export const EXPORT_FORMAT = 'impact-log-export'
export const EXPORT_VERSION = 1

const exportFileSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedAt: z.string(),
  impacts: z.array(z.unknown()),
})

export function exportJson(impacts: readonly Impact[], now: Date = new Date()): string {
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: now.toISOString(),
      impacts: [...impacts].sort(compareImpactsDesc),
    },
    null,
    2,
  )
}

export type ImportResult = { impacts: Impact[]; skipped: number }

/** Импорт своего же экспорта (записи сохраняют objectId — повторный импорт не плодит дубли) */
export function importJson(text: string): ImportResult {
  const file = exportFileSchema.parse(JSON.parse(text))
  const impacts: Impact[] = []
  let skipped = 0
  for (const raw of file.impacts) {
    try {
      impacts.push(migrateImpact(raw))
    } catch {
      skipped++
    }
  }
  return { impacts, skipped }
}

function csvCell(value: string): string {
  return /[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function exportCsv(impacts: readonly Impact[]): string {
  const header = [
    'occurredAt',
    'title',
    'impactScore',
    'categories',
    'labels',
    'metrics',
    'evidence',
    'description',
    'objectId',
  ]
  const rows = [...impacts]
    .sort(compareImpactsDesc)
    .map((i) =>
      [
        i.occurredAt,
        i.title,
        String(i.impactScore),
        i.categories.join('; '),
        i.labels.join('; '),
        (i.metrics ?? [])
          .map(
            (m) =>
              `${m.label}=${m.baseline !== undefined ? `${m.baseline}->` : ''}${m.value}${m.unit ?? ''}`,
          )
          .join('; '),
        (i.evidence ?? []).map((e) => e.url ?? e.ref ?? e.title ?? '').join('; '),
        i.description ?? '',
        i.objectId,
      ]
        .map(csvCell)
        .join(','),
    )
  return [header.join(','), ...rows].join('\n')
}
