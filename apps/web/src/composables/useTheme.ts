import { readonly, ref, watchEffect } from 'vue'
import { resolveTheme, THEME_COLOR, type Theme, toggleTheme } from '@/utils/theme'
import { readStoredTheme, writeStoredTheme } from '@/utils/themeStorage'

/*
 * Тема оформления — светлая или тёмная, глобальное состояние интерфейса (синглтон модуля).
 * Пока пользователь не выбрал тему сам, берём системную (один раз, при загрузке).
 * Первичную тему до отрисовки ставит public/theme-init.js, дальше управляет этот модуль.
 */
const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
const theme = ref<Theme>(resolveTheme(readStoredTheme(), systemDark))

/** Применяет тему к документу; вызывается один раз в main.ts */
export function initTheme() {
  watchEffect(() => {
    document.documentElement.dataset.theme = theme.value
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLOR[theme.value])
  })
}

export function useTheme() {
  function setTheme(next: Theme) {
    theme.value = next
    writeStoredTheme(next)
  }

  return {
    theme: readonly(theme),
    setTheme,
    toggle: () => setTheme(toggleTheme(theme.value)),
  }
}
