import {
  buildCaptureUrl,
  CAPTURE_PATH,
  DRAFT_SCHEMA_VERSION,
  encodeDraft,
  type ImpactDraft,
  impactDraftSchema,
  MAX_HANDOFF_LENGTH,
  newId,
} from '@impact-log/core'

export type DraftFields = Omit<ImpactDraft, 'schemaVersion' | 'draftId'>

export class DraftTooLargeError extends Error {
  constructor(readonly length: number) {
    super(`draft too large for URL handoff: ${length} > ${MAX_HANDOFF_LENGTH}`)
    this.name = 'DraftTooLargeError'
  }
}

function withoutEmpty<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length),
    ),
  ) as T
}

/** Черновик Capture Protocol, проверенный схемой ядра (ошибка — с перечнем полей) */
export function makeDraft(fields: DraftFields): ImpactDraft {
  const result = impactDraftSchema.safeParse(
    withoutEmpty({ ...fields, schemaVersion: DRAFT_SCHEMA_VERSION, draftId: newId() }),
  )
  if (!result.success) {
    throw new Error(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    )
  }
  return result.data
}

/** ${appUrl}/capture#draft=… — фрагмент не уходит на сервер */
export function captureUrl(appUrl: string, draft: ImpactDraft): string {
  const length = `${appUrl}${CAPTURE_PATH}#draft=`.length + encodeDraft(draft).length
  if (length > MAX_HANDOFF_LENGTH) throw new DraftTooLargeError(length)
  return buildCaptureUrl(appUrl, draft)
}

/** Обрезка до max UTF-16 символов (так считает zod) с «…», не разрывая суррогатные пары */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  let cut = max - 1
  const code = text.charCodeAt(cut - 1)
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1
  return `${text.slice(0, cut).trimEnd()}…`
}
