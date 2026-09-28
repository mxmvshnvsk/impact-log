/*
 * <meta name="theme-color"> (панель браузера на mobile, заголовок окна установленного PWA) — цвет фона
 * текущей темы. В index.html он задан по системной теме; здесь подстраиваем под выбранную
 * пользователем и следим за переключением (атрибут data-theme на <html>). Цвет берём из токена.
 */
export function syncThemeColor(): void {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  if (metas.length === 0) return
  const root = document.documentElement
  const apply = () => {
    const color = getComputedStyle(root).getPropertyValue('--color-bg').trim()
    if (!color) return
    // Оба варианта (светлый/тёмный по media) получают цвет выбранной темы
    for (const meta of metas) meta.content = color
  }
  apply()
  new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ['data-theme'] })
}
