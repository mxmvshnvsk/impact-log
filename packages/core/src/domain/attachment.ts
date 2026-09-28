import { z } from 'zod'

/**
 * Ссылка на вложение (Stage 6.5). Сам файл — зашифрованный blob; имя, MIME, подпись, размеры и т.п.
 * лежат в encryptedMetadata. В схеме с первого дня как точка расширения.
 */
export const ATTACHMENT_KINDS = ['image', 'audio', 'document', 'binary'] as const
export const attachmentRefSchema = z.object({
  attachmentId: z.uuid(),
  blobId: z.uuid(),
  kind: z.enum(ATTACHMENT_KINDS),
  /** Зашифрованные метаданные (формат — crypto/object) */
  encryptedMetadata: z.string(),
})
export type AttachmentRef = z.infer<typeof attachmentRefSchema>

/** Расшифрованные метаданные вложения */
export const attachmentMetadataSchema = z.object({
  filename: z.string().max(255),
  mimeType: z.string().max(120),
  size: z.number().int().nonnegative(),
  caption: z.string().max(500).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().positive().optional(),
})
export type AttachmentMetadata = z.infer<typeof attachmentMetadataSchema>

export function attachmentKindOf(mimeType: string): AttachmentRef['kind'] {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (/pdf|text|word|document|sheet|presentation|markdown/.test(mimeType)) return 'document'
  return 'binary'
}
