import { type Evidence, TITLE_MAX, todayIso } from '@impact-log/core'
import { EXCERPT_MAX, linkEvidence, type PageContext, pageSource } from './lib/capture'
import { captureUrl, type DraftFields, DraftTooLargeError, makeDraft, truncate } from './lib/draft'
import { t } from './lib/i18n'
import { cleanPageTitle, readSelection } from './lib/page'
import { loadSettings } from './lib/settings'

/**
 * Service worker: пункты контекстного меню. Клик → черновик → сразу вкладка ${appUrl}/capture#draft=….
 * Ничего не хранит и не отправляет; activeTab выдаётся Chrome на время клика по пункту меню.
 */
const MENU = {
  page: 'impact-log:page',
  selection: 'impact-log:selection',
  link: 'impact-log:link',
} as const

chrome.runtime.onInstalled.addListener(() => {
  void setupMenus()
})

async function setupMenus(): Promise<void> {
  await chrome.contextMenus.removeAll()
  chrome.contextMenus.create({ id: MENU.page, title: t('menuCapturePage'), contexts: ['page'] })
  chrome.contextMenus.create({
    id: MENU.selection,
    title: t('menuCaptureSelection'),
    contexts: ['selection'],
  })
  chrome.contextMenus.create({ id: MENU.link, title: t('menuCaptureLink'), contexts: ['link'] })
}

// Неотправленный черновик окна расширения живёт, пока жива вкладка
chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(`popup:${tabId}`)
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  capture(info, tab).catch((error: unknown) => reportFailure(tab, error))
})

type ClickInfo = Parameters<Parameters<typeof chrome.contextMenus.onClicked.addListener>[0]>[0]
type Tab = chrome.tabs.Tab

function pageFields(page: PageContext): DraftFields {
  const evidence = linkEvidence(page.url, page.title)
  return {
    title: truncate(cleanPageTitle(page.title), TITLE_MAX),
    evidence: evidence ? [evidence] : [],
  }
}

function selectionFields(text: string, page: PageContext): DraftFields {
  const fields = pageFields(page)
  const [first] = fields.evidence ?? []
  const quoted: Evidence = first
    ? { ...first, excerpt: text }
    : { kind: 'text', excerpt: text, ...(page.title ? { title: truncate(page.title, 300) } : {}) }
  return { ...fields, evidence: text ? [quoted] : fields.evidence }
}

function linkFields(url: string): DraftFields {
  // Заголовок записи не угадываем: это «что сделали», а не текст ссылки
  const evidence = linkEvidence(url)
  return { evidence: evidence ? [evidence] : [] }
}

const EXCERPT_STEPS = [EXCERPT_MAX, 2000, 1000, 300]

/** Если черновик не помещается в ссылку — ужимаем цитату, пока не поместится */
function fitToLink(appUrl: string, fields: DraftFields): string {
  let lastError: unknown
  for (const max of EXCERPT_STEPS) {
    const evidence = fields.evidence?.map((item) =>
      item.excerpt ? { ...item, excerpt: truncate(item.excerpt, max) } : item,
    )
    try {
      return captureUrl(appUrl, makeDraft({ ...fields, evidence }))
    } catch (error) {
      if (!(error instanceof DraftTooLargeError)) throw error
      lastError = error
    }
  }
  throw lastError
}

async function capture(info: ClickInfo, tab: Tab | undefined): Promise<void> {
  const settings = await loadSettings()
  const page: PageContext = { url: info.pageUrl ?? tab?.url, title: tab?.title }
  let fields: DraftFields
  if (info.menuItemId === MENU.link && info.linkUrl) {
    fields = linkFields(info.linkUrl)
  } else if (info.menuItemId === MENU.selection) {
    const selected =
      (tab?.id !== undefined ? await readSelection(tab.id, info.frameId ?? 0) : '') ||
      info.selectionText?.trim() ||
      ''
    fields = selectionFields(selected, page)
  } else if (info.menuItemId === MENU.page) {
    fields = pageFields(page)
  } else {
    return
  }
  const url = fitToLink(settings.appUrl, {
    ...fields,
    impactScore: settings.defaultScore,
    occurredAt: todayIso(),
    source: pageSource(page),
  })
  await chrome.tabs.create({
    url,
    ...(tab?.id !== undefined ? { index: tab.index + 1, openerTabId: tab.id } : {}),
  })
}

/** Ошибку показываем значком «!» и подсказкой на кнопке расширения в этой вкладке */
function reportFailure(tab: Tab | undefined, error: unknown): void {
  console.error('impact log: capture failed', error)
  const tabId = tab?.id
  if (tabId === undefined) return
  const detail = error instanceof Error ? error.message : String(error)
  void chrome.action.setBadgeBackgroundColor({ color: '#d93b45', tabId })
  void chrome.action.setBadgeText({ text: '!', tabId })
  void chrome.action.setTitle({ title: t('menuFailed', detail), tabId })
  setTimeout(() => {
    void chrome.action.setBadgeText({ text: '', tabId })
    void chrome.action.setTitle({ title: t('actionTitle'), tabId })
  }, 8000)
}
