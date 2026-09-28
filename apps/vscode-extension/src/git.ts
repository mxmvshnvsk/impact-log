import { execFile } from 'node:child_process'
import { basename, dirname } from 'node:path'
import { type HostedRepo, parseRemoteUrl } from './git-remote'

/**
 * Git через execFile (без shell). --literal-pathspecs — имена файлов не трактуются как pathspec-магия,
 * core.fsmonitor=false — в чужом репозитории не запускаем fsmonitor-хуки. Только чтение.
 */
function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['--literal-pathspecs', '-c', 'core.fsmonitor=false', ...args],
      {
        cwd,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        timeout: 10_000,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    )
  })
}

const tryGit = (args: string[], cwd: string) =>
  git(args, cwd).then(
    (out) => out.trim(),
    () => null,
  )

export interface BranchInfo {
  name: string
  /** Имя ветки на remote, если у неё есть upstream на том же remote */
  remoteName?: string
}

export interface RepoInfo {
  root: string
  head: string | null
  repo: HostedRepo | null
  branch?: BranchInfo
}

async function remoteOf(cwd: string): Promise<{ name: string; repo: HostedRepo | null } | null> {
  const remotes = (await tryGit(['remote'], cwd))?.split('\n').filter(Boolean) ?? []
  const name = remotes.includes('origin') ? 'origin' : remotes[0]
  if (!name) return null
  const url = await tryGit(['remote', 'get-url', name], cwd)
  return { name, repo: url ? parseRemoteUrl(url) : null }
}

export async function readRepo(cwd: string): Promise<RepoInfo | null> {
  const root = await tryGit(['rev-parse', '--show-toplevel'], cwd)
  if (!root) return null
  const [head, remote, branchName] = await Promise.all([
    tryGit(['rev-parse', '--verify', '--quiet', 'HEAD'], cwd),
    remoteOf(cwd),
    tryGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], cwd),
  ])
  let branch: BranchInfo | undefined
  if (branchName) {
    const upstream = await tryGit(
      [
        'for-each-ref',
        '--format=%(upstream:remotename)%00%(upstream:remoteref)',
        `refs/heads/${branchName}`,
      ],
      cwd,
    )
    const [upstreamRemote, upstreamRef] = upstream?.split('\0') ?? []
    const remoteName =
      remote && upstreamRemote === remote.name && upstreamRef?.startsWith('refs/heads/')
        ? upstreamRef.slice('refs/heads/'.length)
        : undefined
    branch = { name: branchName, ...(remoteName ? { remoteName } : {}) }
  }
  return { root, head, repo: remote?.repo ?? null, ...(branch ? { branch } : {}) }
}

export interface FileInfo extends RepoInfo {
  /** Путь относительно корня репозитория (с «/»), если файл под git */
  path?: string
  /** Файл отличается от HEAD — номера строк в HEAD могут не совпасть */
  changed: boolean
}

export async function readFile(filePath: string): Promise<FileInfo | null> {
  const cwd = dirname(filePath)
  const name = basename(filePath)
  const repo = await readRepo(cwd)
  if (!repo) return null
  const listed = await tryGit(['ls-files', '-z', '--full-name', '--', name], cwd)
  const path = listed?.split('\0')[0] || undefined
  let changed = true
  if (path && repo.head) {
    changed = await git(['diff', '--quiet', 'HEAD', '--', name], cwd).then(
      () => false,
      () => true,
    )
  }
  return { ...repo, ...(path ? { path } : {}), changed }
}

export interface CommitInfo {
  sha: string
  subject: string
  body: string
  /** YYYY-MM-DD в часовом поясе автора */
  date: string
}

export async function readCommit(cwd: string, rev = 'HEAD'): Promise<CommitInfo | null> {
  const raw = await tryGit(
    ['log', '-1', '--no-color', '--no-show-signature', '--format=%H%x00%aI%x00%s%x00%b', rev, '--'],
    cwd,
  )
  if (!raw) return null
  const [sha = '', isoDate = '', subject = '', body = ''] = raw.split('\0')
  return { sha, subject: subject.trim(), body: body.trim(), date: isoDate.slice(0, 10) }
}
