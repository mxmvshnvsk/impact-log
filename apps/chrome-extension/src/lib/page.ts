/**
 * Выделенный текст страницы. Выполняется ВНУТРИ страницы через chrome.scripting.executeScript,
 * поэтому функция самодостаточна (без импортов и замыканий). Поля паролей не читаем.
 */
export function getSelectedText(): string {
  const active = document.activeElement
  if (
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLInputElement && /^(text|search|url|email|tel)$/.test(active.type))
  ) {
    const { selectionStart, selectionEnd, value } = active
    if (selectionStart !== null && selectionEnd !== null && selectionEnd > selectionStart) {
      return value.slice(selectionStart, selectionEnd)
    }
  }
  return window.getSelection()?.toString() ?? ''
}

/** Требует activeTab (клик по расширению или пункту меню). Недоступные страницы — пустая строка */
export async function readSelection(tabId: number, frameId = 0): Promise<string> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      func: getSelectedText,
    })
    return typeof injection?.result === 'string' ? injection.result.trim() : ''
  } catch {
    return ''
  }
}

export const URL_MAX = 2000

/** В черновик попадают только http(s)-адреса (не file://, chrome:// и т.п.) разумной длины */
export function isWebUrl(value: string | undefined): value is string {
  if (!value || value.length > URL_MAX) return false
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Заголовок вкладки → заголовок записи: убираем хвосты сервисов.
 * «Speed up CI by alice · Pull Request #42 · org/repo» → «Speed up CI».
 */
export function cleanPageTitle(title: string | undefined): string {
  if (!title) return ''
  const value = title.trim()
  const githubPr = value.match(/^(.+?) by \S+ · Pull Request #\d+ · \S+$/)
  if (githubPr?.[1]) return githubPr[1]
  const githubIssue = value.match(/^(.+?) · (?:Issue|Discussion) #\d+ · \S+$/)
  if (githubIssue?.[1]) return githubIssue[1]
  return value
    .replace(
      /\s+[·|–—-]\s+(GitHub|GitLab|Bitbucket|Jira|Confluence|Google (Docs|Sheets|Slides)|Notion|Linear|YouTrack)$/i,
      '',
    )
    .trim()
}
