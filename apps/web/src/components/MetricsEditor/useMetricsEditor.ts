import { nextTick, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { emptyMetricRow, type MetricRow } from '@/components/ImpactForm/impactFormState'
import { formatSigned, metricChange, parseNumberInput } from '@/utils/numbers'

export const MAX_METRICS = 10

export type MetricsEditorProps = {
  modelValue: readonly MetricRow[]
  /** Ошибки формы по путям (metrics.0.value → ключ validation.*) */
  errors: Readonly<Record<string, string>>
}

type Emit = ((event: 'update:modelValue', value: MetricRow[]) => void) &
  ((event: 'blur', path: string) => void)

export function useMetricsEditor(props: MetricsEditorProps, emit: Emit) {
  const { t, locale } = useI18n()
  const baseId = useId()

  const fieldId = (index: number, field: keyof MetricRow) => `${baseId}-${index}-${field}`

  function error(index: number, field: keyof MetricRow): string | null {
    const key = props.errors[`metrics.${index}.${field}`]
    return key ? t(`validation.${key}`) : null
  }

  function update(index: number, field: keyof MetricRow, value: string) {
    emit(
      'update:modelValue',
      props.modelValue.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    )
  }

  async function add() {
    if (props.modelValue.length >= MAX_METRICS) return
    const index = props.modelValue.length
    emit('update:modelValue', [...props.modelValue, emptyMetricRow()])
    await nextTick()
    document.getElementById(fieldId(index, 'label'))?.focus()
  }

  function remove(index: number) {
    emit(
      'update:modelValue',
      props.modelValue.filter((_, i) => i !== index),
    )
  }

  /** «Δ −4 мин · −66,7 %» для строки, где заданы оба числа */
  function change(row: MetricRow): { text: string; direction: 'up' | 'down' | 'flat' } | null {
    const value = parseNumberInput(row.value)
    const baseline = parseNumberInput(row.baseline)
    if (value === null || baseline === null) return null
    const result = metricChange({ label: row.label || '-', value, baseline })
    if (!result) return null
    const unit = row.unit.trim()
    const delta = `${formatSigned(result.delta, locale.value)}${unit ? ` ${unit}` : ''}`
    const percent =
      result.percent === null ? '' : ` · ${formatSigned(result.percent, locale.value)}%`
    return {
      text: `${delta}${percent}`,
      direction: result.delta > 0 ? 'up' : result.delta < 0 ? 'down' : 'flat',
    }
  }

  return { t, fieldId, error, update, add, remove, change, max: MAX_METRICS }
}
