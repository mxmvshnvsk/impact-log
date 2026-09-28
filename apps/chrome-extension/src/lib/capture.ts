import { type Evidence, evidenceFromUrl, type ImpactDraft } from '@impact-log/core'
import { truncate } from './draft'
import { t } from './i18n'
import { isWebUrl, URL_MAX } from './page'

export const EXCERPT_MAX = 4000
export const EVIDENCE_TITLE_MAX = 300

export interface PageContext {
  url?: string
  title?: string
}

/** Ссылка → артефакт (PR/задача/коммит/документ/ссылка); не-http(s) — undefined */
export function linkEvidence(url: string | undefined, title?: string): Evidence | undefined {
  if (!isWebUrl(url)) return undefined
  const evidence = evidenceFromUrl(url, title ? truncate(title, EVIDENCE_TITLE_MAX) : undefined)
  return evidence.url && evidence.url.length <= URL_MAX ? evidence : undefined
}

export function pageSource(page: PageContext): NonNullable<ImpactDraft['source']> {
  return { type: 'chrome', ...(isWebUrl(page.url) ? { uri: page.url } : {}) }
}

/** Выделенное → цитата в Markdown (для описания) */
export function markdownQuote(text: string): string {
  return text
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n')
}

/** Подпись распознанного типа ссылки для бейджа в popup */
export function describeEvidence(evidence: Evidence): string {
  switch (evidence.kind) {
    case 'pr':
      return t('kindPr', evidence.ref ?? '')
    case 'issue':
      return t('kindIssue', evidence.ref ?? '')
    case 'commit':
      return t('kindCommit', (evidence.ref ?? '').slice(0, 7))
    case 'doc':
      return t('kindDoc')
    default:
      return t('kindUrl')
  }
}
