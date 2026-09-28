import { computed } from 'vue'

export type ChartTooltipProps = {
  /** Точка привязки в пикселях относительно контейнера графика */
  x: number
  y: number
  /** Ширина контейнера — чтобы подсказка не вылезала за края */
  width: number
  /** Первая строка — значение (крупно), дальше — пояснения */
  lines: readonly string[]
}

/**
 * Подсказка «прилипает» к точке, а её собственный сдвиг зависит от положения точки:
 * у левого края она уходит вправо, у правого — влево. Измерять DOM не нужно.
 */
export function useChartTooltip(props: ChartTooltipProps) {
  const style = computed(() => {
    const ratio = props.width > 0 ? Math.min(1, Math.max(0, props.x / props.width)) : 0.5
    return {
      left: `${props.x}px`,
      top: `${props.y}px`,
      transform: `translate(${-ratio * 100}%, calc(-100% - 10px))`,
    }
  })
  return { style }
}
