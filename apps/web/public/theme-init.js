// Ставит тему (data-theme на <html>) до первой отрисовки — без вспышки светлой темы.
// Явный выбор пользователя, иначе системная тема. Логика совпадает с src/utils/theme.ts,
// ключ хранилища — с src/utils/themeStorage.ts.
;(() => {
  let stored = null
  try {
    stored = localStorage.getItem('impact-log:theme')
  } catch {
    // хранилище недоступно — используем системную тему
  }
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = stored === 'dark' || (stored !== 'light' && systemDark)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
})()
