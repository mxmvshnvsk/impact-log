export type Theme = 'light' | 'dark'

/** Цвет панели браузера на мобильных — совпадает с --color-bg темы */
export const THEME_COLOR: Record<Theme, string> = { light: '#f4f6f5', dark: '#0c110f' }

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

/**
 * Тема: явный выбор пользователя, а если его ещё не было — системная.
 * Логика совпадает с public/theme-init.js
 */
export function resolveTheme(stored: Theme | null, systemDark: boolean): Theme {
  return stored ?? (systemDark ? 'dark' : 'light')
}

export function toggleTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark'
}
