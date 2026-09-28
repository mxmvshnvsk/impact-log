import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'

/** Данные графика таблицей: для скринридеров всегда, для всех — по кнопке «Таблицей» */
export type ChartTable = {
  columns: readonly string[]
  rows: readonly { key: string; cells: readonly string[] }[]
}

export function useChartFrame() {
  const { t } = useI18n()
  const titleId = useId()
  const asTable = ref(false)

  function toggle() {
    asTable.value = !asTable.value
  }

  return { t, titleId, asTable, toggle }
}
