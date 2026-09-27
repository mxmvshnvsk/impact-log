import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

export function useNotFoundView() {
  const { t } = useI18n()
  const route = useRoute()
  const path = computed(() => route.fullPath)

  return { t, path }
}
