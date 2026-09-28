import type { Evidence } from '@impact-log/core'
import {
  CircleDot,
  FileText,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Link,
  Quote,
} from 'lucide-vue-next'

/** Иконка по виду артефакта (evidence.kind) */
export const EVIDENCE_ICONS: Record<Evidence['kind'], typeof Link> = {
  url: Link,
  pr: GitPullRequest,
  issue: CircleDot,
  commit: GitCommitHorizontal,
  branch: GitBranch,
  doc: FileText,
  text: Quote,
}
