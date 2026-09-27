import { Moon, Sun } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme } from '@/composables/useTheme'

/** Кнопка-переключатель светлой/тёмной темы. Иконка показывает, на какую тему переключит */
export function useThemeSwitcher() {
  const { t } = useI18n()
  const { theme, toggle } = useTheme()

  const icon = computed(() => (theme.value === 'dark' ? Sun : Moon))
  const label = computed(() => t(theme.value === 'dark' ? 'theme.toLight' : 'theme.toDark'))

  return { label, icon, cycle: toggle }
}
