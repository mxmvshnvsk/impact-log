import type { RouteLocationRaw } from 'vue-router'

export type UiTabItem = { key: string; label: string; to: RouteLocationRaw }

export type UiTabsProps = {
  /** Вкладки-ссылки: активная определяется маршрутом (aria-current="page") */
  items: UiTabItem[]
  /** Подпись навигации для скринридеров */
  label: string
}
