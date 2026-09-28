import { ChartColumnBig, FileText, NotebookPen, Settings } from 'lucide-vue-next'
import type { RouteLocationRaw } from 'vue-router'

export type NavItem = {
  key: string
  icon: typeof NotebookPen
  /** Нет маршрута — раздел ещё в разработке («скоро») */
  to?: RouteLocationRaw
  /** Имена маршрутов, при которых пункт подсвечен */
  match: string[]
}

/** Разделы приложения: сайдбар на tablet/desktop, нижняя панель на mobile */
export const NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    icon: NotebookPen,
    to: { name: 'dashboard' },
    match: ['dashboard', 'impact', 'impact-new', 'impact-edit', 'capture'],
  },
  { key: 'insights', icon: ChartColumnBig, to: { name: 'insights' }, match: ['insights'] },
  { key: 'review', icon: FileText, to: { name: 'review' }, match: ['review'] },
  {
    key: 'settings',
    icon: Settings,
    to: { name: 'settings' },
    match: ['settings', 'settings-account', 'settings-data'],
  },
]
