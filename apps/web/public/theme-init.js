// Ставит тему (data-theme на <html>) до первой отрисовки — без вспышки светлой темы.
// Логика должна совпадать с src/utils/theme.ts; ключ хранилища — с src/utils/themeStorage.ts.
;(() => {
  let preference = null
  try {
    preference = localStorage.getItem('impact-log:theme')
  } catch {
    // хранилище недоступно — используем системную тему
  }
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = preference === 'dark' || (preference !== 'light' && systemDark)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
})()
