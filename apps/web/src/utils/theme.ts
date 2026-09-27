/** Выбор пользователя: как в системе, всегда светлая или всегда тёмная */
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]
export type Theme = 'light' | 'dark'

/** Цвет панели браузера на мобильных — совпадает с --color-bg темы */
export const THEME_COLOR: Record<Theme, string> = { light: '#f4f6f5', dark: '#0c110f' }

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
}

/** Логика совпадает с public/theme-init.js */
export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  if (preference === 'system') return systemDark ? 'dark' : 'light'
  return preference
}

/** Следующий вариант для кнопки-переключателя: system → light → dark → system */
export function nextThemePreference(current: ThemePreference): ThemePreference {
  const index = THEME_PREFERENCES.indexOf(current)
  return THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length] ?? 'system'
}
