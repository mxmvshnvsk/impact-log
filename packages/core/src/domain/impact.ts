import { z } from 'zod'
import { newId } from '../ids'
import { attachmentRefSchema } from './attachment'
import { evidenceSchema } from './evidence'
import { normalizeCategories, normalizeLabels } from './labels'
import { metricSchema } from './metric'

/**
 * Impact — центральный доменный объект. Живёт на клиенте; на сервер уходит только целиком
 * зашифрованный payload. schemaVersion + objectId стабильны с первого дня (ADR-0005, §13).
 */
export const IMPACT_SCHEMA_VERSION = 1
export const IMPACT_SCORE_MIN = 1
export const IMPACT_SCORE_MAX = 5
export const TITLE_MAX = 200
export const DESCRIPTION_MAX = 20_000

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'impact.date')
const isoTimestamp = z.string().datetime({ offset: true })

export const impactScoreSchema = z
  .number()
  .int()
  .min(IMPACT_SCORE_MIN, 'impact.score')
  .max(IMPACT_SCORE_MAX, 'impact.score')

export const impactSchema = z.object({
  objectId: z.uuid(),
  schemaVersion: z.literal(IMPACT_SCHEMA_VERSION),
  /** Когда это произошло (дата, без времени) */
  occurredAt: isoDate,
  title: z.string().trim().min(1, 'impact.titleRequired').max(TITLE_MAX, 'impact.titleTooLong'),
  /** Markdown */
  description: z.string().max(DESCRIPTION_MAX, 'impact.descriptionTooLong').optional(),
  /** 1 — заметная мелочь … 5 — ключевой результат года */
  impactScore: impactScoreSchema,
  categories: z.array(z.string().max(40)).max(10),
  labels: z.array(z.string().max(40)).max(20),
  metrics: z.array(metricSchema).max(10).optional(),
  evidence: z.array(evidenceSchema).max(20).optional(),
  attachments: z.array(attachmentRefSchema).max(50).optional(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})
export type Impact = z.infer<typeof impactSchema>

/** Поля, которые пользователь редактирует (без служебных) */
export const impactInputSchema = impactSchema
  .omit({ objectId: true, schemaVersion: true, createdAt: true, updatedAt: true })
  .extend({
    description: z.string().max(DESCRIPTION_MAX, 'impact.descriptionTooLong').optional(),
  })
export type ImpactInput = z.input<typeof impactInputSchema>

function clean(input: ImpactInput) {
  const parsed = impactInputSchema.parse(input)
  const description = parsed.description?.trim()
  return {
    ...parsed,
    description: description ? description : undefined,
    categories: normalizeCategories(parsed.categories),
    labels: normalizeLabels(parsed.labels),
    metrics: parsed.metrics?.length ? parsed.metrics : undefined,
    evidence: parsed.evidence?.length ? parsed.evidence : undefined,
    attachments: parsed.attachments?.length ? parsed.attachments : undefined,
  }
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

export function createImpact(input: ImpactInput, now: Date = new Date()): Impact {
  const timestamp = now.toISOString()
  return impactSchema.parse(
    withoutUndefined({
      ...clean(input),
      objectId: newId(),
      schemaVersion: IMPACT_SCHEMA_VERSION,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  )
}

export function updateImpact(impact: Impact, input: ImpactInput, now: Date = new Date()): Impact {
  return impactSchema.parse(
    withoutUndefined({
      ...clean(input),
      objectId: impact.objectId,
      schemaVersion: IMPACT_SCHEMA_VERSION,
      createdAt: impact.createdAt,
      updatedAt: now.toISOString(),
    }),
  )
}

/** Для формы редактирования */
export function toImpactInput(impact: Impact): ImpactInput {
  const { objectId: _id, schemaVersion: _v, createdAt: _c, updatedAt: _u, ...input } = impact
  return input
}

/* ---------- миграции схемы ---------- */

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>

/**
 * Миграции payload'а: ключ — версия, С которой мигрируем. Пока версия одна.
 * Пример на будущее: MIGRATIONS[1] = (v1) => ({ ...v1, schemaVersion: 2, newField: … })
 */
const MIGRATIONS: Record<number, Migration> = {}

export class ImpactSchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImpactSchemaError'
  }
}

/** Разбор расшифрованного payload'а любой известной версии в актуальный Impact */
export function migrateImpact(raw: unknown): Impact {
  if (typeof raw !== 'object' || raw === null) throw new ImpactSchemaError('not an object')
  let current = raw as Record<string, unknown>
  let version = Number(current.schemaVersion)
  if (!Number.isInteger(version) || version < 1) throw new ImpactSchemaError('bad schemaVersion')
  if (version > IMPACT_SCHEMA_VERSION) {
    throw new ImpactSchemaError(`schemaVersion ${version} is newer than supported`)
  }
  while (version < IMPACT_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version]
    if (!migrate) throw new ImpactSchemaError(`no migration from ${version}`)
    current = migrate(current)
    version = Number(current.schemaVersion)
  }
  return impactSchema.parse(current)
}

/** Сортировка ленты: сначала свежие по дате события, затем по времени создания */
export function compareImpactsDesc(a: Impact, b: Impact): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
}
