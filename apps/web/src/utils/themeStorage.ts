import { isThemePreference, type ThemePreference } from './theme'

/** Ключ совпадает с public/theme-init.js */
const KEY = 'impact-log:theme'

export function readStoredTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY)
    return isThemePreference(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

export function writeStoredTheme(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, preference)
  } catch {
    // хранилище недоступно — выбор действует до перезагрузки
  }
}
