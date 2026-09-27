import { CalendarDays, Flame, NotebookPen } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSession } from '@/composables/useSession'

/** Виджеты статистики (механика bragbook): пока без данных */
const STATS = [
  { key: 'total', icon: NotebookPen },
  { key: 'streak', icon: Flame },
  { key: 'month', icon: CalendarDays },
] as const

export function useHomeView() {
  const { t } = useI18n()
  const { user } = useSession()
  const login = computed(() => user.value?.login ?? '')

  return { t, login, stats: STATS }
}
