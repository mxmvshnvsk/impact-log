import { isTheme, type Theme } from './theme'

/** Ключ совпадает с public/theme-init.js */
const KEY = 'impact-log:theme'

export function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(KEY)
    return isTheme(value) ? value : null
  } catch {
    return null
  }
}

export function writeStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // хранилище недоступно — выбор действует до перезагрузки
  }
}
