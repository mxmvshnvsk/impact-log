import {
  buildCaptureUrl,
  CAPTURE_PATH,
  DRAFT_SCHEMA_VERSION,
  encodeDraft,
  type ImpactDraft,
  impactDraftSchema,
  MAX_HANDOFF_LENGTH,
  newId,
  normalizeLabels,
} from '@impact-log/core'
import { inputError } from './errors'
import { t } from './i18n'

export type DraftFields = Omit<ImpactDraft, 'schemaVersion' | 'draftId'>

function withoutEmpty<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length)),
  ) as T
}

/** Проверка схемой ядра (DRAFT_SCHEMA_VERSION, draftId) с понятной ошибкой */
export function makeDraft(fields: DraftFields): ImpactDraft {
  const result = impactDraftSchema.safeParse(
    withoutEmpty({
      ...fields,
      labels: fields.labels ? normalizeLabels(fields.labels) : undefined,
      schemaVersion: DRAFT_SCHEMA_VERSION,
      draftId: newId(),
    }),
  )
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'draft'}: ${issue.message}`)
      .join('; ')
    throw inputError(t('error.invalidDraft', { details }))
  }
  return result.data
}

/** ${appUrl}/capture#draft=… или ошибка ввода, если черновик не помещается в ссылку */
export function captureUrl(appUrl: string, draft: ImpactDraft): string {
  const length = `${appUrl}${CAPTURE_PATH}#draft=`.length + encodeDraft(draft).length
  if (length > MAX_HANDOFF_LENGTH) {
    throw inputError(t('error.tooLarge', { length, max: MAX_HANDOFF_LENGTH }))
  }
  return buildCaptureUrl(appUrl, draft)
}
