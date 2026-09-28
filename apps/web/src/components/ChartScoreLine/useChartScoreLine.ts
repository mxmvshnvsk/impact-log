import { IMPACT_SCORE_MAX, IMPACT_SCORE_MIN } from '@impact-log/core'
import { computed, type Ref, ref } from 'vue'
import { CHART_MARGIN_LEFT } from '@/components/ChartColumns/useChartColumns'
import { useChartWidth } from '@/components/ChartFrame'
import { linearScale, stepIndex } from '@/utils/chartScale'

export type ScoreDatum = {
  key: string
  /** Средняя оценка корзины; null — записей нет */
  value: number | null
  tooltip: readonly string[]
}

export type ChartScoreLineProps = {
  data: readonly ScoreDatum[]
  title: string
  description: string
  navLabel: string
  /** Средняя за весь период — тонкая опорная линия */
  reference?: number | null
  height?: number
  active?: number | null
}

type Emit = (event: 'update:active', value: number | null) => void

/** Поля совпадают с ChartColumns по горизонтали — точки стоят ровно под столбцами */
const MARGIN = { top: 10, right: 4, bottom: 10, left: CHART_MARGIN_LEFT }
const TICKS = [IMPACT_SCORE_MIN, 3, IMPACT_SCORE_MAX]

/**
 * Средняя оценка по корзинам — отдельный мини-график со своей шкалой 1–5
 * (вместо второй оси на графике количества).
 */
export function useChartScoreLine(
  props: ChartScoreLineProps,
  emit: Emit,
  root: Ref<HTMLElement | null>,
) {
  const width = useChartWidth(root)
  const owner = ref(false)
  const height = computed(() => props.height ?? 112)

  const layout = computed(() => {
    const count = props.data.length
    const innerWidth = Math.max(10, width.value - MARGIN.left - MARGIN.right)
    const band = count ? innerWidth / count : innerWidth
    const y = linearScale(
      [IMPACT_SCORE_MIN, IMPACT_SCORE_MAX],
      [height.value - MARGIN.bottom, MARGIN.top],
    )
    return { band, y }
  })

  const points = computed(() =>
    props.data.map((datum, index) => ({
      ...datum,
      index,
      x: MARGIN.left + layout.value.band * index + layout.value.band / 2,
      y: datum.value === null ? null : layout.value.y(datum.value),
      hitX: MARGIN.left + layout.value.band * index,
    })),
  )

  /** Линия рвётся на корзинах без записей: соединяем только соседние точки */
  const segments = computed(() => {
    const result: string[] = []
    let current: string[] = []
    for (const point of points.value) {
      if (point.y === null) {
        if (current.length > 1) result.push(current.join(' '))
        current = []
        continue
      }
      current.push(`${current.length ? 'L' : 'M'}${point.x},${point.y}`)
    }
    if (current.length > 1) result.push(current.join(' '))
    return result
  })

  const gridLines = computed(() => TICKS.map((tick) => ({ value: tick, y: layout.value.y(tick) })))

  const referenceY = computed(() =>
    props.reference === null || props.reference === undefined
      ? null
      : layout.value.y(props.reference),
  )

  /** Точки мельче при плотной сетке недель */
  const radius = computed(() => (layout.value.band < 12 ? 3 : 4))

  const activePoint = computed(() =>
    props.active === null || props.active === undefined
      ? null
      : (points.value[props.active] ?? null),
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
    owner.value && activePoint.value ? activePoint.value.tooltip.join(', ') : '',
  )

  return {
    width,
    height,
    margin: MARGIN,
    layout,
    points,
    segments,
    gridLines,
    referenceY,
    radius,
    owner,
    activePoint,
    liveText,
    onPointerEnter,
    onPointerLeave,
    onFocus,
    onBlur,
    onKeydown,
  }
}
