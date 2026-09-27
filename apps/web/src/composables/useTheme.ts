import { computed, readonly, ref, watchEffect } from 'vue'
import { nextThemePreference, resolveTheme, THEME_COLOR, type ThemePreference } from '@/utils/theme'
import { readStoredTheme, writeStoredTheme } from '@/utils/themeStorage'

/*
 * Тема оформления — глобальное состояние интерфейса (как и язык), синглтон модуля.
 * Первичную тему до отрисовки ставит public/theme-init.js, дальше управляет этот модуль.
 */
const preference = ref<ThemePreference>(readStoredTheme())
const systemQuery = window.matchMedia('(prefers-color-scheme: dark)')
const systemDark = ref(systemQuery.matches)
systemQuery.addEventListener('change', (event) => {
  systemDark.value = event.matches
})

const theme = computed(() => resolveTheme(preference.value, systemDark.value))

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
  function setPreference(next: ThemePreference) {
    preference.value = next
    writeStoredTheme(next)
  }

  return {
    preference: readonly(preference),
    theme,
    setPreference,
    cycle: () => setPreference(nextThemePreference(preference.value)),
  }
}
