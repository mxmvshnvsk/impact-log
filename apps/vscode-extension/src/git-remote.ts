/**
 * Разбор git remote → веб-адрес репозитория (GitHub, GitLab, Bitbucket) и ссылки на коммит/ветку/файл.
 * Чистые функции без git. Копия apps/cli/src/git-remote.ts — держать в синхроне
 * (TODO: вынести в packages/core/capture, когда владелец разрешит правку core).
 */
export type GitProvider = 'github' | 'gitlab' | 'bitbucket'

export interface HostedRepo {
  provider: GitProvider
  /** https://github.com/org/repo */
  webUrl: string
  /** org/repo (у GitLab — с подгруппами) */
  slug: string
}

function providerOf(host: string): GitProvider | null {
  if (host === 'bitbucket.org') return 'bitbucket'
  if (host === 'github.com' || host.split('.').includes('github')) return 'github'
  if (host === 'gitlab.com' || host.split('.').includes('gitlab')) return 'gitlab'
  return null
}

/**
 * Поддерживает: git@host:org/repo.git, ssh://git@host[:port]/org/repo.git, git+ssh://…,
 * https://[user[:token]@]host[:port]/org/repo(.git), git://host/org/repo.git.
 * Логин/токен из https-remote в ссылки никогда не попадает.
 */
export function parseRemoteUrl(remote: string): HostedRepo | null {
  const value = remote.trim()
  let host: string
  let path: string
  let origin: string
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      return null
    }
    host = url.hostname.toLowerCase()
    path = decodeURIComponent(url.pathname)
    const web = url.protocol === 'https:' || url.protocol === 'http:'
    origin = web ? `${url.protocol}//${host}${url.port ? `:${url.port}` : ''}` : ''
  } else {
    // scp-подобный синтаксис: [user@]host:path (не путь Windows вида C:\…)
    const match = value.match(/^(?:[^@/\s]+@)?([^:/\s]{2,}):(?!\/\/)(.+)$/)
    if (!match?.[1] || !match[2]) return null
    host = match[1].toLowerCase()
    path = match[2]
    origin = ''
  }
  // ssh через 443-й порт: ssh.github.com, altssh.gitlab.com, altssh.bitbucket.org
  if (host === 'ssh.github.com') host = 'github.com'
  if (host.startsWith('altssh.')) host = host.slice('altssh.'.length)
  const provider = providerOf(host)
  const slug = path
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
  if (!provider || !/^[^/\s]+(\/[^/\s]+)+$/.test(slug)) return null
  return { provider, slug, webUrl: `${origin || `https://${host}`}/${slug}` }
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

export function commitUrl(repo: HostedRepo, sha: string): string {
  switch (repo.provider) {
    case 'github':
      return `${repo.webUrl}/commit/${sha}`
    case 'gitlab':
      return `${repo.webUrl}/-/commit/${sha}`
    case 'bitbucket':
      return `${repo.webUrl}/commits/${sha}`
  }
}

export function branchUrl(repo: HostedRepo, branch: string): string {
  switch (repo.provider) {
    case 'github':
      return `${repo.webUrl}/tree/${encodePath(branch)}`
    case 'gitlab':
      return `${repo.webUrl}/-/tree/${encodePath(branch)}`
    case 'bitbucket':
      return `${repo.webUrl}/branch/${encodePath(branch)}`
  }
}

/** Постоянная ссылка на файл в коммите, опционально на диапазон строк (1-based, включительно) */
export function fileUrl(
  repo: HostedRepo,
  sha: string,
  path: string,
  lines?: { start: number; end: number },
): string {
  const file = encodePath(path)
  const single = !lines || lines.start === lines.end
  switch (repo.provider) {
    case 'github': {
      // Markdown GitHub рендерит, и якоря строк работают только в «plain»-режиме
      const plain = lines && /\.(md|mdx|markdown)$/i.test(path) ? '?plain=1' : ''
      const anchor = lines ? (single ? `#L${lines.start}` : `#L${lines.start}-L${lines.end}`) : ''
      return `${repo.webUrl}/blob/${sha}/${file}${plain}${anchor}`
    }
    case 'gitlab': {
      const anchor = lines ? (single ? `#L${lines.start}` : `#L${lines.start}-${lines.end}`) : ''
      return `${repo.webUrl}/-/blob/${sha}/${file}${anchor}`
    }
    case 'bitbucket': {
      const anchor = lines
        ? single
          ? `#lines-${lines.start}`
          : `#lines-${lines.start}:${lines.end}`
        : ''
      return `${repo.webUrl}/src/${sha}/${file}${anchor}`
    }
  }
}
