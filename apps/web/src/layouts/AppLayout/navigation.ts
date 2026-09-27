import { ChartColumnBig, House, NotebookPen, ShieldCheck } from 'lucide-vue-next'
import type { RouteLocationRaw } from 'vue-router'

export type NavItem = {
  key: string
  icon: typeof House
  /** Нет маршрута — раздел ещё в разработке («скоро») */
  to?: RouteLocationRaw
}

/** Разделы приложения: сайдбар на tablet/desktop, нижняя панель на mobile */
export const NAV_ITEMS: NavItem[] = [
  { key: 'home', icon: House, to: { name: 'home' } },
  { key: 'entries', icon: NotebookPen },
  { key: 'summaries', icon: ChartColumnBig },
  { key: 'principles', icon: ShieldCheck, to: { name: 'principles' } },
]
