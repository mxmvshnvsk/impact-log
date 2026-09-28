import { z } from 'zod'
import { attachmentRefSchema } from '../domain/attachment'
import { evidenceSchema } from '../domain/evidence'
import { type ImpactInput, impactScoreSchema } from '../domain/impact'
import { normalizeCategories, normalizeLabels } from '../domain/labels'
import { metricSchema } from '../domain/metric'
import { newId, todayIso } from '../ids'

/**
 * Capture Protocol (ADR-0010): все поверхности захвата — Web, Chrome, CLI, VS Code — производят один и тот же
 * версионированный ImpactDraft. Черновик — ещё не история: клиент проверяет/дополняет, пользователь подтверждает.
 */
export const DRAFT_SCHEMA_VERSION = 1
export const CAPTURE_SOURCES = ['web', 'chrome', 'cli', 'vscode'] as const

export const impactDraftSchema = z.object({
  schemaVersion: z.literal(DRAFT_SCHEMA_VERSION),
  draftId: z.uuid(),
  title: z.string().max(200).optional(),
  description: z.string().max(20_000).optional(),
  impactScore: impactScoreSchema.optional(),
  occurredAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  categories: z.array(z.string().max(40)).max(10).optional(),
  labels: z.array(z.string().max(40)).max(20).optional(),
  metrics: z.array(metricSchema).max(10).optional(),
  evidence: z.array(evidenceSchema).max(20).optional(),
  attachments: z.array(attachmentRefSchema).max(50).optional(),
  source: z
    .object({
      type: z.enum(CAPTURE_SOURCES),
      uri: z.string().max(2000).optional(),
      externalRef: z.string().max(200).optional(),
    })
    .optional(),
})
export type ImpactDraft = z.infer<typeof impactDraftSchema>

export function createDraft(fields: Omit<ImpactDraft, 'schemaVersion' | 'draftId'>): ImpactDraft {
  return impactDraftSchema.parse({
    ...fields,
    schemaVersion: DRAFT_SCHEMA_VERSION,
    draftId: newId(),
  })
}

/** Черновик → поля формы Impact (с разумными значениями по умолчанию). Валидацию делает форма */
export function draftToImpactInput(draft: ImpactDraft, now: Date = new Date()): ImpactInput {
  return {
    title: draft.title ?? '',
    description: draft.description,
    impactScore: draft.impactScore ?? 3,
    occurredAt: draft.occurredAt ?? todayIso(now),
    categories: normalizeCategories(draft.categories ?? []),
    labels: normalizeLabels(draft.labels ?? []),
    metrics: draft.metrics,
    evidence: draft.evidence,
    attachments: draft.attachments,
  }
}

/* ---------- передача черновика в web-клиент ---------- */

/**
 * Handoff: черновик кладётся во фрагмент URL (#draft=…). Фрагмент не отправляется на сервер и не попадает
 * в логи — черновик видит только браузер пользователя. Web-клиент показывает его в форме и шифрует после подтверждения.
 */
export const CAPTURE_PATH = '/capture'
export const MAX_HANDOFF_LENGTH = 16_000

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

export function encodeDraft(draft: ImpactDraft): string {
  return toBase64Url(JSON.stringify(impactDraftSchema.parse(draft)))
}

export function decodeDraft(encoded: string): ImpactDraft {
  if (encoded.length > MAX_HANDOFF_LENGTH) throw new Error('draft too large')
  return impactDraftSchema.parse(JSON.parse(fromBase64Url(encoded)))
}

/** https://impact-log.com/capture#draft=… */
export function buildCaptureUrl(appOrigin: string, draft: ImpactDraft): string {
  const url = `${appOrigin.replace(/\/+$/, '')}${CAPTURE_PATH}#draft=${encodeDraft(draft)}`
  if (url.length > MAX_HANDOFF_LENGTH) throw new Error('draft too large for URL handoff')
  return url
}

/** Разбор фрагмента «#draft=…» (или null) */
export function readDraftFromHash(hash: string): ImpactDraft | null {
  const match = hash.match(/(?:^#|&)draft=([A-Za-z0-9_-]+)/)
  if (!match?.[1]) return null
  try {
    return decodeDraft(match[1])
  } catch {
    return null
  }
}
