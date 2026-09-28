/** Строки — только из _locales (chrome.i18n): en по умолчанию, ru по языку браузера */
type Messages = typeof import('../../static/_locales/en/messages.json')
export type MessageName = Exclude<keyof Messages, 'default'>

export function t(name: MessageName, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(name, substitutions) || name
}

const ATTRIBUTES = [
  ['i18nPlaceholder', 'data-i18n-placeholder', 'placeholder'],
  ['i18nAriaLabel', 'data-i18n-aria-label', 'aria-label'],
  ['i18nTitle', 'data-i18n-title', 'title'],
] as const

/** Подставляет переводы в [data-i18n] (текст) и data-i18n-{placeholder,aria-label,title} */
export function applyI18n(root: ParentNode = document): void {
  document.documentElement.lang = chrome.i18n.getUILanguage()
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n as MessageName)
  }
  for (const [key, selector, attribute] of ATTRIBUTES) {
    for (const element of root.querySelectorAll<HTMLElement>(`[${selector}]`)) {
      element.setAttribute(attribute, t(element.dataset[key] as MessageName))
    }
  }
}

export function scoreLabel(score: number): string {
  return `${score} — ${t(`score${score}` as MessageName)}`
}

/** Подписи 1…5 в сегментированном выборе оценки: title + aria-label с расшифровкой */
export function labelScoreInputs(root: ParentNode, name = 'score'): void {
  for (const input of root.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)) {
    const label = scoreLabel(Number(input.value))
    input.setAttribute('aria-label', label)
    input.closest('label')?.setAttribute('title', label)
  }
}

export function query<T extends Element>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`missing element ${selector}`)
  return element
}
