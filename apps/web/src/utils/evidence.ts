import type { Evidence } from '@impact-log/core'

/** Похоже на ссылку: http(s)://… или «домен.зона/путь» без пробелов */
export function looksLikeUrl(value: string): boolean {
  const clean = value.trim()
  if (/\s/.test(clean)) return false
  return /^https?:\/\/\S+$/i.test(clean) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(clean)
}

/** Без протокола пользователи вставляют редко, но бывает: github.com/… → https://github.com/… */
export function withProtocol(value: string): string {
  const clean = value.trim()
  return /^[a-z][a-z\d+.-]*:/i.test(clean) ? clean : `https://${clean}`
}

/** Только http(s)-ссылки становятся кликабельными (javascript: и прочее — нет) */
export function safeHref(url: string | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

export function hostOf(url: string | undefined): string {
  if (!url) return ''
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Главная строка артефакта: заголовок → ref → хост/ссылка → текст заметки */
export function evidencePrimary(evidence: Evidence): string {
  return (
    evidence.title ||
    evidence.ref ||
    hostOf(evidence.url) ||
    evidence.url ||
    evidence.excerpt?.slice(0, 120) ||
    ''
  )
}

/** Короткий путь ссылки для второй строки: github.com/org/repo/pull/12 */
export function shortUrl(url: string | undefined): string {
  if (!url) return ''
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.replace(/\/$/, '')
    return `${parsed.host.replace(/^www\./, '')}${path}`
  } catch {
    return url
  }
}
