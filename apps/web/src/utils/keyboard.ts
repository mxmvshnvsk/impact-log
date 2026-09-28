/** Фокус в поле ввода — одиночные горячие клавиши (n, /, e) не должны срабатывать */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** Одиночная клавиша без модификаторов, не в поле ввода и не в открытом диалоге */
export function isPlainShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.repeat) return false
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  if (isTypingTarget(event.target)) return false
  return !document.querySelector('dialog[open]')
}

/** Cmd+Enter (macOS) / Ctrl+Enter */
export function isSubmitShortcut(event: KeyboardEvent): boolean {
  return event.key === 'Enter' && (event.metaKey || event.ctrlKey)
}
