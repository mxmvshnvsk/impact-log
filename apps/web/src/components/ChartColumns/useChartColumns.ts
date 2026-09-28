import { computed, type Ref, ref } from 'vue'
import { useChartWidth } from '@/components/ChartFrame'
import {
  columnPath,
  estimateTextWidth,
  labelStride,
  linearScale,
  niceTicks,
  stepIndex,
} from '@/utils/chartScale'

export type ColumnDatum = {
  key: string
  value: number
  /** Подпись оси: обычная и компактная (узкий экран) */
  axisLabel: string
  compactLabel: string
  /** Строки подсказки: первая — значение (крупно), дальше — пояснения */
  tooltip: readonly string[]
  /** Корзина частично вне периода (неполная неделя/месяц на краю) */
  partial?: boolean
}

export type ChartColumnsProps = {
  data: readonly ColumnDatum[]
  /** Для <title>/<desc> SVG */
  title: string
  description: string
  /** Подсказка для клавиатуры: «стрелки ←/→ — по столбцам» */
  navLabel: string
  height?: number
  /** Подсвеченный столбец (общий с соседним графиком) */
  active?: number | null
}

type Emit = (event: 'update:active', value: number | null) => void

/** Левое поле фиксировано — чтобы соседние графики с той же осью X совпадали по столбцам */
export const CHART_MARGIN_LEFT = 32
const MARGIN = { top: 22, right: 4, bottom: 26, left: CHART_MARGIN_LEFT }
const MAX_BAR = 24
const GAP = 2
const COMPACT_WIDTH = 520
const FONT = 11

export function useChartColumns(
  props: ChartColumnsProps,
  emit: Emit,
  root: Ref<HTMLElement | null>,
) {
  const width = useChartWidth(root)
  /** Подсказку показывает только тот график, над которым указатель/фокус */
  const owner = ref(false)
  const height = computed(() => props.height ?? 200)

  const layout = computed(() => {
    const count = props.data.length
    const innerWidth = Math.max(10, width.value - MARGIN.left - MARGIN.right)
    const innerHeight = Math.max(10, height.value - MARGIN.top - MARGIN.bottom)
    const band = count ? innerWidth / count : innerWidth
    const bar = Math.max(1, Math.min(MAX_BAR, band * 0.66, band - GAP))
    const max = Math.max(0, ...props.data.map((d) => d.value))
    const ticks = niceTicks(max, innerHeight < 140 ? 3 : 4)
    const top = ticks[ticks.length - 1] ?? 1
    const y = linearScale([0, top], [MARGIN.top + innerHeight, MARGIN.top])
    return { count, innerWidth, innerHeight, band, bar, ticks, y, baseline: y(0) }
  })

  const compact = computed(() => width.value < COMPACT_WIDTH)

  const columns = computed(() => {
    const { band, bar, y, baseline } = layout.value
    return props.data.map((datum, index) => {
      const center = MARGIN.left + band * index + band / 2
      const top = y(datum.value)
      return {
        ...datum,
        index,
        center,
        top,
        path: columnPath(center - bar / 2, top, bar, baseline - top),
        hitX: MARGIN.left + band * index,
      }
    })
  })

  /** Прямая подпись — только у максимума (и у активного столбца) */
  const peakIndex = computed(() => {
    let peak = -1
    props.data.forEach((d, i) => {
      if (d.value > 0 && (peak === -1 || d.value >= (props.data[peak]?.value ?? 0))) peak = i
    })
    return peak
  })

  const gridLines = computed(() =>
    layout.value.ticks.map((tick) => ({ value: tick, y: layout.value.y(tick) })),
  )

  const xLabels = computed(() => {
    const { band, count } = layout.value
    const texts = props.data.map((d) => (compact.value ? d.compactLabel : d.axisLabel))
    const widest = Math.max(0, ...texts.map((text) => estimateTextWidth(text, FONT)))
    const stride = labelStride(count, band, widest)
    return columns.value
      .filter((column) => (count - 1 - column.index) % stride === 0)
      .map((column) => {
        const text = texts[column.index] ?? ''
        const half = estimateTextWidth(text, FONT) / 2
        let anchor: 'start' | 'middle' | 'end' = 'middle'
        if (column.center - half < 0) anchor = 'start'
        else if (column.center + half > width.value) anchor = 'end'
        const x = anchor === 'start' ? Math.max(0, column.center - band / 2) : column.center
        return { key: column.key, text, x: anchor === 'end' ? width.value : x, anchor }
      })
  })

  const activeColumn = computed(() =>
    props.active === null || props.active === undefined
      ? null
      : (columns.value[props.active] ?? null),
  )

  function setActive(index: number | null) {
    if (index !== props.active) emit('update:active', index)
  }

  function onPointerEnter(index: number) {
    owner.value = true
    setActive(index)
  }

  function onPointerLeave() {
    owner.value = false
    setActive(null)
  }

  function onFocus() {
    owner.value = true
    if (props.active === null || props.active === undefined) setActive(props.data.length - 1)
  }

  function onBlur() {
    owner.value = false
    setActive(null)
  }

  function onKeydown(event: KeyboardEvent) {
    const next = stepIndex(event.key, props.active ?? null, props.data.length, 'x')
    if (next === null) return
    event.preventDefault()
    owner.value = true
    setActive(next)
  }

  const liveText = computed(() =>
    owner.value && activeColumn.value ? activeColumn.value.tooltip.join(', ') : '',
  )

  return {
    width,
    height,
    margin: MARGIN,
    layout,
    columns,
    peakIndex,
    gridLines,
    xLabels,
    owner,
    activeColumn,
    liveText,
    onPointerEnter,
    onPointerLeave,
    onFocus,
    onBlur,
    onKeydown,
  }
}
