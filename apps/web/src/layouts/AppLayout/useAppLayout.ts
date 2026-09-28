import { computed, ref } from 'vue'
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
      active: item.match.includes(String(route.name)),
    })),
  )

  const title = computed(() => (route.meta.title ? t(route.meta.title) : ''))

  /** «Перейти к содержимому» для клавиатуры: мимо сайдбара и шапки — сразу в main (без смены URL) */
  const mainRef = ref<HTMLElement | null>(null)
  function skipToContent() {
    mainRef.value?.focus()
    mainRef.value?.scrollIntoView({ block: 'start' })
  }

  return { t, items, title, mainRef, skipToContent }
}
