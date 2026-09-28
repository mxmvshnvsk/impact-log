import { execFile } from 'node:child_process'
import { CliError, EXIT } from './errors'
import { type HostedRepo, parseRemoteUrl } from './git-remote'
import { t } from './i18n'

interface GitFailure extends Error {
  code?: string | number
  stderr?: string
}

/** git без shell; GIT_OPTIONAL_LOCKS=0 — только чтение, не трогаем index.lock */
export function git(args: string[], cwd = process.cwd()): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
      },
      (error, stdout, stderr) => {
        if (error) {
          const failure = error as GitFailure
          failure.stderr = stderr
          reject(failure)
        } else resolve(stdout)
      },
    )
  })
}

const tryGit = (args: string[], cwd?: string) =>
  git(args, cwd).then(
    (out) => out.trim(),
    () => null,
  )

export interface CommitInfo {
  sha: string
  subject: string
  body: string
  /** YYYY-MM-DD в часовом поясе автора */
  date: string
  /** Ветка, если коммит — её вершина (HEAD), и её имя на remote, если есть upstream */
  branch?: { name: string; remoteName?: string }
  repo: HostedRepo | null
}

async function ensureRepo(): Promise<void> {
  try {
    await git(['rev-parse', '--is-inside-work-tree'])
  } catch (error) {
    if ((error as GitFailure).code === 'ENOENT') throw new CliError(t('error.gitMissing'))
    throw new CliError(t('error.notGitRepo'), EXIT.input)
  }
}

async function remoteName(): Promise<string | null> {
  const remotes = (await tryGit(['remote']))?.split('\n').filter(Boolean) ?? []
  return remotes.includes('origin') ? 'origin' : (remotes[0] ?? null)
}

export async function readCommit(rev: string): Promise<CommitInfo> {
  await ensureRepo()
  if (!rev || rev.startsWith('-')) throw new CliError(t('error.unknownRev', { rev }), EXIT.input)
  const sha = await tryGit([
    'rev-parse',
    '--verify',
    '--quiet',
    '--end-of-options',
    `${rev}^{commit}`,
  ])
  if (!sha) throw new CliError(t('error.unknownRev', { rev }), EXIT.input)

  let raw: string
  try {
    raw = await git([
      'log',
      '-1',
      '--no-color',
      '--no-show-signature',
      '--format=%H%x00%aI%x00%s%x00%b',
      sha,
      '--',
    ])
  } catch (error) {
    const failure = error as GitFailure
    throw new CliError(t('error.git', { message: (failure.stderr || failure.message).trim() }))
  }
  const [fullSha = sha, isoDate = '', subject = '', body = ''] = raw.split('\0')

  const remote = await remoteName()
  const remoteUrl = remote ? await tryGit(['remote', 'get-url', remote]) : null
  const repo = remoteUrl ? parseRemoteUrl(remoteUrl) : null

  let branch: CommitInfo['branch']
  const head = await tryGit(['rev-parse', 'HEAD'])
  const name =
    head === fullSha ? await tryGit(['symbolic-ref', '--quiet', '--short', 'HEAD']) : null
  if (name) {
    const upstream = await tryGit([
      'for-each-ref',
      '--format=%(upstream:remotename)%00%(upstream:remoteref)',
      `refs/heads/${name}`,
    ])
    const [upstreamRemote, upstreamRef] = upstream?.split('\0') ?? []
    const remoteBranch =
      upstreamRemote === remote && upstreamRef?.startsWith('refs/heads/')
        ? upstreamRef.slice('refs/heads/'.length)
        : undefined
    branch = { name, ...(remoteBranch ? { remoteName: remoteBranch } : {}) }
  }

  return {
    sha: fullSha.trim(),
    subject: subject.trim(),
    body: body.trim(),
    date: isoDate.slice(0, 10),
    ...(branch ? { branch } : {}),
    repo,
  }
}
