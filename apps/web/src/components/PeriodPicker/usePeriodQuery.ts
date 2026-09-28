import type { PeriodPreset } from '@impact-log/core'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  type PeriodSelection,
  parsePeriodQuery,
  periodQuery,
  samePeriodSelection,
} from '@/utils/periodSelection'

/**
 * Период экрана хранится в query URL. Значение по умолчанию в URL не пишем — ссылка остаётся чистой.
 */
export function usePeriodQuery(fallback: PeriodPreset) {
  const route = useRoute()
  const router = useRouter()

  const selection = computed<PeriodSelection>({
    get: () => parsePeriodQuery(route.query, fallback),
    set: (next) => {
      const { period: _p, from: _f, to: _t, ...rest } = route.query
      const isDefault = samePeriodSelection(next, { preset: fallback })
      void router.replace({ query: isDefault ? rest : { ...rest, ...periodQuery(next) } })
    },
  })

  return { selection }
}
