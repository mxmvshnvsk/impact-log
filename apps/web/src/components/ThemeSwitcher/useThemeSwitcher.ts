import { Monitor, Moon, Sun } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme } from '@/composables/useTheme'

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const

/** Кнопка-переключатель: как в системе → светлая → тёмная */
export function useThemeSwitcher() {
  const { t } = useI18n()
  const { preference, cycle } = useTheme()

  const icon = computed(() => ICONS[preference.value])
  const label = computed(() => t('theme.label', { mode: t(`theme.${preference.value}`) }))

  return { label, icon, cycle }
}
