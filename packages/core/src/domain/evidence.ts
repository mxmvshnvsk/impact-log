import { z } from 'zod'

/**
 * Доказательство/артефакт: ссылка на PR, задачу, коммит, документ, выделенный текст.
 * Отдельно от описания: это «откуда видно», а не «что сделал».
 */
export const EVIDENCE_KINDS = ['url', 'pr', 'issue', 'commit', 'branch', 'doc', 'text'] as const
export const evidenceSchema = z.object({
  kind: z.enum(EVIDENCE_KINDS),
  url: z.string().trim().max(2000).optional(),
  title: z.string().trim().max(300).optional(),
  /** Идентификатор во внешней системе: номер PR, ключ задачи, SHA */
  ref: z.string().trim().max(200).optional(),
  /** Выделенный текст / фрагмент — только если пользователь явно выбрал */
  excerpt: z.string().max(4000).optional(),
})
export type Evidence = z.infer<typeof evidenceSchema>

/** Угадывает вид доказательства по URL (GitHub/GitLab/Jira/…) */
export function evidenceFromUrl(url: string, title?: string): Evidence {
  const clean = url.trim()
  let kind: Evidence['kind'] = 'url'
  let ref: string | undefined
  const pr = clean.match(/\/(?:pull|merge_requests)\/(\d+)/)
  const commit = clean.match(/\/commit\/([0-9a-f]{7,40})/i)
  const jira = clean.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/)
  const issue = clean.match(/\/issues\/(\d+)/)
  if (pr) {
    kind = 'pr'
    ref = `#${pr[1]}`
  } else if (commit) {
    kind = 'commit'
    ref = commit[1]?.slice(0, 12)
  } else if (jira) {
    kind = 'issue'
    ref = jira[1]
  } else if (issue) {
    kind = 'issue'
    ref = `#${issue[1]}`
  } else if (/docs\.google|notion\.so|confluence|\/wiki\//i.test(clean)) {
    kind = 'doc'
  }
  return { kind, url: clean, ...(title ? { title } : {}), ...(ref ? { ref } : {}) }
}
