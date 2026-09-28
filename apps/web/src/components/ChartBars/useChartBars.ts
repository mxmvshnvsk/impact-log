import { computed, type Ref, ref } from 'vue'
import { useChartWidth } from '@/components/ChartFrame'
import { barPath, estimateTextWidth, fitText, stepIndex } from '@/utils/chartScale'

export type BarDatum = {
  key: string
  label: string
  value: number
  /** Прямая подпись на конце полосы: «12 · 22%» */
  valueLabel: string
  tooltip: readonly string[]
  /** muted — второстепенные полосы (например, оценки 1–3 рядом с «сильными» 4–5) */
  tone?: 'accent' | 'muted'
}

export type ChartBarsProps = {
  data: readonly BarDatum[]
  title: string
  description: string
  navLabel: string
  /** Общий максимум шкалы (по умолчанию — максимум данных) */
  max?: number
}

const ROW = 44
const LABEL_BASELINE = 14
const BAR_Y = 21
const BAR_HEIGHT = 14
const LABEL_FONT = 13
const VALUE_FONT = 12

/** Горизонтальные полосы: подпись над полосой, значение — на её конце, шкала от нуля */
export function useChartBars(props: ChartBarsProps, root: Ref<HTMLElement | null>) {
  const width = useChartWidth(root)
  const owner = ref(false)
  const active = ref<number | null>(null)

  const height = computed(() => Math.max(ROW, props.data.length * ROW - 6))

  const rows = computed(() => {
    const valueSpace =
      Math.max(0, ...props.data.map((d) => estimateTextWidth(d.valueLabel, VALUE_FONT))) + 10
    const track = Math.max(20, width.value - valueSpace)
    const max = props.max ?? Math.max(1, ...props.data.map((d) => d.value))
    return props.data.map((datum, index) => {
      const top = index * ROW
      const length = datum.value > 0 ? Math.max(3, (datum.value / max) * track) : 0
      return {
        ...datum,
        index,
        top,
        text: fitText(datum.label, width.value - 4, LABEL_FONT),
        labelY: top + LABEL_BASELINE,
        barY: top + BAR_Y,
        length,
        path: barPath(0, top + BAR_Y, length, BAR_HEIGHT),
        valueX: length + 6,
        valueY: top + BAR_Y + BAR_HEIGHT / 2,
      }
    })
  })

  const activeRow = computed(() =>
    active.value === null ? null : (rows.value[active.value] ?? null),
  )

  function onPointerEnter(index: number) {
    owner.value = true
    active.value = index
  }

  function onPointerLeave() {
    owner.value = false
    active.value = null
  }

  function onFocus() {
    owner.value = true
    active.value ??= 0
  }

  function onKeydown(event: KeyboardEvent) {
    const next = stepIndex(event.key, active.value, props.data.length, 'y')
    if (next === null) return
    event.preventDefault()
    owner.value = true
    active.value = next
  }

  /** Значение — первой строкой, затем имя строки и пояснения */
  const tooltipLines = computed(() =>
    activeRow.value
      ? [
          activeRow.value.tooltip[0] ?? '',
          activeRow.value.label,
          ...activeRow.value.tooltip.slice(1),
        ]
      : [],
  )

  const liveText = computed(() =>
    owner.value && activeRow.value
      ? [activeRow.value.label, ...activeRow.value.tooltip].join(', ')
      : '',
  )

  return {
    width,
    height,
    rows,
    barHeight: BAR_HEIGHT,
    owner,
    activeRow,
    tooltipLines,
    liveText,
    onPointerEnter,
    onPointerLeave,
    onFocus,
    onBlur: onPointerLeave,
    onKeydown,
  }
}
