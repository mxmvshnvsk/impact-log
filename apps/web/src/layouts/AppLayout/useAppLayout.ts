import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { NAV_ITEMS } from './navigation'

export function useAppLayout() {
  const { t } = useI18n()
  const route = useRoute()

  const items = computed(() =>
    NAV_ITEMS.map((item) => ({
      ...item,
      label: item.to ? t(`nav.${item.key}`) : `${t(`nav.${item.key}`)} — ${t('nav.soon')}`,
      shortLabel: t(`nav.${item.key}`),
      active: item.to !== undefined && route.name === (item.to as { name: string }).name,
    })),
  )

  const title = computed(() => (route.meta.title ? t(route.meta.title) : ''))

  return { t, items, title }
}
