import { DESCRIPTION_MAX, type Evidence, TITLE_MAX } from '@impact-log/core'
import { makeDraft } from '../draft'
import { truncate } from '../fields'
import { readCommit } from '../git'
import { branchUrl, commitUrl } from '../git-remote'
import { handOff } from '../handoff'
import { t } from '../i18n'
import { draftFieldsFromFlags, draftOptions, handoffFromFlags, parseCommandArgs } from './common'

const options = {
  ...draftOptions,
  rev: { type: 'string' },
} as const

export async function runGit(args: string[]): Promise<void> {
  const { values } = parseCommandArgs('git', args, options, false)
  if (values.help) {
    process.stdout.write(`${t('help.git')}\n`)
    return
  }
  const fields = draftFieldsFromFlags(values)
  const handoff = await handoffFromFlags(values)
  const commit = await readCommit(values.rev ?? 'HEAD')
  const { repo } = commit

  const commitEvidence: Evidence = {
    kind: 'commit',
    ref: commit.sha.slice(0, 12),
    ...(commit.subject ? { title: truncate(commit.subject, 300) } : {}),
    ...(repo ? { url: commitUrl(repo, commit.sha) } : {}),
  }
  const evidence: Evidence[] = [commitEvidence]
  if (commit.branch) {
    const remoteBranch = commit.branch.remoteName
    evidence.push({
      kind: 'branch',
      ref: truncate(commit.branch.name, 200),
      ...(repo && remoteBranch ? { url: branchUrl(repo, remoteBranch) } : {}),
    })
  }

  const draft = makeDraft({
    ...fields,
    ...(commit.subject ? { title: truncate(commit.subject, TITLE_MAX) } : {}),
    ...(commit.body ? { description: truncate(commit.body, DESCRIPTION_MAX) } : {}),
    occurredAt: fields.occurredAt ?? commit.date,
    evidence: [...evidence, ...(fields.evidence ?? [])],
    source: {
      type: 'cli',
      externalRef: repo ? `${repo.slug}@${commit.sha}` : commit.sha,
      ...(commitEvidence.url ? { uri: commitEvidence.url } : {}),
    },
  })
  await handOff(draft, handoff)
}
