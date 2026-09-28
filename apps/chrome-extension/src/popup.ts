import {
  type Evidence,
  normalizeCategories,
  normalizeLabels,
  TITLE_MAX,
  todayIso,
} from '@impact-log/core'
import {
  describeEvidence,
  EVIDENCE_TITLE_MAX,
  EXCERPT_MAX,
  linkEvidence,
  markdownQuote,
  pageSource,
} from './lib/capture'
import { captureUrl, DraftTooLargeError, makeDraft, truncate } from './lib/draft'
import { applyI18n, labelScoreInputs, type MessageName, query, scoreLabel, t } from './lib/i18n'
import { cleanPageTitle, isWebUrl, readSelection } from './lib/page'
import { DEFAULT_SETTINGS, isScore, loadSettings, type Settings } from './lib/settings'

/** Состояние формы; пока не отправлено — лежит в chrome.storage.session (в памяти, до закрытия браузера) */
interface PopupState {
  url?: string
  title: string
  link: string
  selection: string
  placement: 'quote' | 'description'
  description: string
  score: number
  categories: string
  labels: string
}

const form = query<HTMLFormElement>('#capture-form')
const titleInput = query<HTMLInputElement>('#title')
const titleError = query<HTMLElement>('#title-error')
const linkInput = query<HTMLInputElement>('#link')
const linkError = query<HTMLElement>('#link-error')
const linkKind = query<HTMLElement>('#link-kind')
const selectionField = query<HTMLElement>('#selection-field')
const selectionInput = query<HTMLTextAreaElement>('#selection')
const descriptionInput = query<HTMLTextAreaElement>('#description')
const descriptionDetails = query<HTMLDetailsElement>('#description-details')
const scoreCaption = query<HTMLElement>('#score-caption')
const categoriesInput = query<HTMLInputElement>('#categories')
const labelsInput = query<HTMLInputElement>('#labels')
const labelsPreview = query<HTMLUListElement>('#labels-preview')
const formError = query<HTMLElement>('#form-error')

let tab: chrome.tabs.Tab | undefined
let settings: Settings = DEFAULT_SETTINGS
let persistTimer: ReturnType<typeof setTimeout> | undefined

const stateKey = () => `popup:${tab?.id ?? 'none'}`
const splitList = (value: string) => value.split(',')

/* ---------- состояние ---------- */

function readState(): PopupState {
  const placement = form.querySelector<HTMLInputElement>('input[name="placement"]:checked')?.value
  const score = Number(form.querySelector<HTMLInputElement>('input[name="score"]:checked')?.value)
  return {
    url: tab?.url,
    title: titleInput.value,
    link: linkInput.value,
    selection: selectionInput.value,
    placement: placement === 'description' ? 'description' : 'quote',
    description: descriptionInput.value,
    score: isScore(score) ? score : settings.defaultScore,
    categories: categoriesInput.value,
    labels: labelsInput.value,
  }
}

function writeState(state: PopupState): void {
  titleInput.value = state.title
  linkInput.value = state.link
  selectionInput.value = state.selection
  selectionField.hidden = !state.selection
  descriptionInput.value = state.description
  descriptionDetails.open = Boolean(state.description.trim())
  categoriesInput.value = state.categories
  labelsInput.value = state.labels
  for (const input of form.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
    input.checked =
      (input.name === 'placement' && input.value === state.placement) ||
      (input.name === 'score' && Number(input.value) === state.score)
  }
}

async function loadSavedState(): Promise<PopupState | null> {
  try {
    const saved = (await chrome.storage.session.get(stateKey()))[stateKey()] as
      | PopupState
      | undefined
    return saved && saved.url === tab?.url ? saved : null
  } catch {
    return null
  }
}

function persistSoon(): void {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    void chrome.storage.session.set({ [stateKey()]: readState() }).catch(() => undefined)
  }, 250)
}

/* ---------- живые подсказки ---------- */

function renderLinkKind(): void {
  const value = linkInput.value.trim()
  linkKind.classList.remove('badge--muted', 'badge--danger')
  if (!value) {
    linkKind.hidden = true
    return
  }
  const evidence = linkEvidence(value)
  linkKind.hidden = false
  if (!evidence) {
    linkKind.textContent = t('kindInvalid')
    linkKind.classList.add('badge--danger')
    return
  }
  linkKind.textContent = describeEvidence(evidence)
  if (evidence.kind === 'url') linkKind.classList.add('badge--muted')
}

function renderScoreCaption(): void {
  scoreCaption.textContent = scoreLabel(readState().score)
}

function renderLabelsPreview(): void {
  const labels = normalizeLabels(splitList(labelsInput.value))
  labelsPreview.replaceChildren(
    ...labels.map((label) => {
      const item = document.createElement('li')
      item.textContent = `#${label}`
      return item
    }),
  )
  labelsPreview.hidden = !labels.length
}

function setFieldError(input: HTMLElement, output: HTMLElement, message: MessageName | null) {
  output.textContent = message ? t(message) : ''
  output.hidden = !message
  input.setAttribute('aria-invalid', String(Boolean(message)))
}

function showFormError(message: string | null): void {
  formError.textContent = message ?? ''
  formError.hidden = !message
}

/* ---------- отправка ---------- */

function buildEvidence(state: PopupState): Evidence[] {
  const link = state.link.trim()
  const selection = state.selection.trim()
  const excerpt = selection && state.placement === 'quote' ? truncate(selection, EXCERPT_MAX) : ''
  const pageTitle = tab?.title ? truncate(tab.title, EVIDENCE_TITLE_MAX) : undefined
  const evidence = link ? linkEvidence(link, link === tab?.url ? pageTitle : undefined) : undefined
  if (evidence) return [excerpt ? { ...evidence, excerpt } : evidence]
  if (excerpt) return [{ kind: 'text', excerpt, ...(pageTitle ? { title: pageTitle } : {}) }]
  return []
}

async function submit(): Promise<void> {
  const state = readState()
  showFormError(null)
  const title = state.title.trim()
  const link = state.link.trim()
  const titleInvalid = !title
  const linkInvalid = Boolean(link) && !isWebUrl(link)
  setFieldError(titleInput, titleError, titleInvalid ? 'errorTitleRequired' : null)
  setFieldError(linkInput, linkError, linkInvalid ? 'errorLinkInvalid' : null)
  if (titleInvalid || linkInvalid) {
    ;(titleInvalid ? titleInput : linkInput).focus()
    return
  }

  const selection = state.selection.trim()
  const description = [
    state.description.trim(),
    selection && state.placement === 'description' ? markdownQuote(selection) : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  let url: string
  try {
    const draft = makeDraft({
      title: truncate(title, TITLE_MAX),
      description,
      impactScore: state.score,
      occurredAt: todayIso(),
      categories: normalizeCategories(splitList(state.categories)),
      labels: normalizeLabels(splitList(state.labels)),
      evidence: buildEvidence(state),
      source: pageSource({ url: tab?.url }),
    })
    url = captureUrl(settings.appUrl, draft)
  } catch (error) {
    showFormError(
      error instanceof DraftTooLargeError
        ? t('errorTooLarge')
        : t('errorGeneric', error instanceof Error ? error.message : String(error)),
    )
    return
  }

  clearTimeout(persistTimer)
  await chrome.storage.session.remove(stateKey()).catch(() => undefined)
  await chrome.tabs.create({
    url,
    ...(tab?.id !== undefined ? { index: tab.index + 1, openerTabId: tab.id } : {}),
  })
  window.close()
}

/* ---------- запуск ---------- */

async function init(): Promise<void> {
  applyI18n()
  document.title = t('popupTitle')
  labelScoreInputs(form)
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
  query<HTMLElement>('#shortcut').textContent = isMac ? '⌘↵' : 'Ctrl+↵'

  ;[tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const [loaded, saved, selection] = await Promise.all([
    loadSettings(),
    loadSavedState(),
    tab?.id !== undefined ? readSelection(tab.id) : Promise.resolve(''),
  ])
  settings = loaded
  writeState(
    saved ?? {
      url: tab?.url,
      title: truncate(cleanPageTitle(tab?.title), TITLE_MAX),
      link: isWebUrl(tab?.url) ? tab.url : '',
      selection,
      placement: 'quote',
      description: '',
      score: settings.defaultScore,
      categories: '',
      labels: '',
    },
  )
  renderLinkKind()
  renderScoreCaption()
  renderLabelsPreview()
  titleInput.focus()
}

form.addEventListener('input', (event) => {
  const target = event.target as HTMLElement
  if (target === linkInput) renderLinkKind()
  if (target === labelsInput) renderLabelsPreview()
  if (target === titleInput && titleInput.value.trim()) {
    setFieldError(titleInput, titleError, null)
  }
  if (target === linkInput && linkInput.getAttribute('aria-invalid') === 'true') {
    const link = linkInput.value.trim()
    if (!link || isWebUrl(link)) setFieldError(linkInput, linkError, null)
  }
  persistSoon()
})

form.addEventListener('change', (event) => {
  if ((event.target as HTMLInputElement).name === 'score') renderScoreCaption()
  persistSoon()
})

form.addEventListener('submit', (event) => {
  event.preventDefault()
  void submit()
})

// Ctrl/Cmd+Enter — отправить из любого поля, включая многострочные
form.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    form.requestSubmit()
  }
})

descriptionDetails.addEventListener('toggle', () => {
  if (descriptionDetails.open) descriptionInput.focus()
})

query<HTMLButtonElement>('#open-settings').addEventListener('click', () => {
  void chrome.runtime.openOptionsPage()
})

void init().catch((error: unknown) => {
  showFormError(t('errorGeneric', error instanceof Error ? error.message : String(error)))
})
