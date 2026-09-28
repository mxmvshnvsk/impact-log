import { normalizeAppUrl } from './lib/app-url'
import { applyI18n, labelScoreInputs, type MessageName, query, scoreLabel, t } from './lib/i18n'
import {
  DEFAULT_SETTINGS,
  isScore,
  loadSettings,
  type Settings,
  saveSettings,
} from './lib/settings'

const form = query<HTMLFormElement>('#settings-form')
const appUrlInput = query<HTMLInputElement>('#app-url')
const appUrlError = query<HTMLElement>('#app-url-error')
const scoreCaption = query<HTMLElement>('#score-caption')
const status = query<HTMLElement>('#status')
const resetButton = query<HTMLButtonElement>('#reset')

let statusTimer: ReturnType<typeof setTimeout> | undefined

function renderPermissions(): void {
  for (const item of document.querySelectorAll<HTMLElement>('[data-i18n-permission]')) {
    const text = t(item.dataset.i18nPermission as MessageName)
    const [name = '', ...rest] = text.split(' — ')
    const code = document.createElement('code')
    code.textContent = name
    item.replaceChildren(code, ` — ${rest.join(' — ')}`)
  }
}

function selectedScore(): number {
  const checked = form.querySelector<HTMLInputElement>('input[name="score"]:checked')
  const score = Number(checked?.value)
  return isScore(score) ? score : DEFAULT_SETTINGS.defaultScore
}

function fill(settings: Settings): void {
  appUrlInput.value = settings.appUrl
  const input = form.querySelector<HTMLInputElement>(
    `input[name="score"][value="${settings.defaultScore}"]`,
  )
  if (input) input.checked = true
  scoreCaption.textContent = scoreLabel(settings.defaultScore)
}

function setAppUrlError(message: string | null): void {
  appUrlError.textContent = message ?? ''
  appUrlError.hidden = !message
  appUrlInput.setAttribute('aria-invalid', String(Boolean(message)))
}

function showStatus(message: string): void {
  status.textContent = message
  clearTimeout(statusTimer)
  statusTimer = setTimeout(() => {
    status.textContent = ''
  }, 2500)
}

async function save(settings: Settings): Promise<void> {
  await saveSettings(settings)
  fill(settings)
  showStatus(t('optionsSaved'))
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  const appUrl = normalizeAppUrl(appUrlInput.value)
  if (!appUrl) {
    setAppUrlError(t('optionsAppUrlInvalid'))
    appUrlInput.focus()
    return
  }
  setAppUrlError(null)
  void save({ appUrl, defaultScore: selectedScore() })
})

// Как в формах web-клиента: после первой ошибки поле перепроверяется на каждый ввод
appUrlInput.addEventListener('input', () => {
  if (!appUrlError.hidden && normalizeAppUrl(appUrlInput.value)) setAppUrlError(null)
})

appUrlInput.addEventListener('blur', () => {
  if (appUrlInput.value.trim() && !normalizeAppUrl(appUrlInput.value)) {
    setAppUrlError(t('optionsAppUrlInvalid'))
  }
})

form.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement
  if (target.name === 'score') scoreCaption.textContent = scoreLabel(Number(target.value))
})

resetButton.addEventListener('click', () => {
  setAppUrlError(null)
  void save(DEFAULT_SETTINGS)
})

applyI18n()
document.title = `${t('optionsTitle')} — impact log`
renderPermissions()
labelScoreInputs(form)
void loadSettings().then(fill)
