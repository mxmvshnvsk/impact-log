/**
 * Геометрия SVG-графиков (компоненты Chart*): шкалы, «круглые» деления, скруглённые концы столбцов,
 * прореживание и обрезка подписей. Чистые функции без Vue.
 */

/** «Круглые» целые деления от нуля: 0, 2, 4, 6 … — верхнее деление не меньше max */
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0, 1]
  const raw = max / target
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  const nice =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10
  const step = Math.max(1, Math.round(nice * magnitude))
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let value = 0; value <= top; value += step) ticks.push(value)
  return ticks
}

/** Линейная шкала domain → range */
export function linearScale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0 || 1
  return (value: number) => r0 + ((value - d0) / span) * (r1 - r0)
}

/** Столбец со скруглённым верхом (data-end) и прямым основанием на нулевой линии */
export function columnPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 4,
): string {
  if (height <= 0 || width <= 0) return ''
  const r = Math.min(radius, width / 2, height)
  const bottom = y + height
  return [
    `M${x},${bottom}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${bottom}`,
    'Z',
  ].join(' ')
}

/** Горизонтальная полоса со скруглённым правым концом и прямым началом */
export function barPath(x: number, y: number, width: number, height: number, radius = 4): string {
  if (height <= 0 || width <= 0) return ''
  const r = Math.min(radius, height / 2, width)
  const right = x + width
  return [
    `M${x},${y}`,
    `H${right - r}`,
    `Q${right},${y} ${right},${y + r}`,
    `V${y + height - r}`,
    `Q${right},${y + height} ${right - r},${y + height}`,
    `H${x}`,
    'Z',
  ].join(' ')
}

/** Грубая оценка ширины текста (Manrope ≈ 0.58em на символ) — для раскладки без измерения DOM */
export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.58
}

/** Обрезает подпись с «…», чтобы она влезла в maxWidth (полное имя — в подсказке и таблице) */
export function fitText(text: string, maxWidth: number, fontSize: number): string {
  if (estimateTextWidth(text, fontSize) <= maxWidth) return text
  const chars = Math.max(1, Math.floor(maxWidth / (fontSize * 0.58)) - 1)
  return `${text.slice(0, chars).trimEnd()}…`
}

/** Каждая k-я подпись оси X, чтобы соседние не наезжали друг на друга */
export function labelStride(count: number, bandWidth: number, labelWidth: number): number {
  if (count <= 1 || bandWidth <= 0) return 1
  return Math.max(1, Math.ceil((labelWidth + 8) / bandWidth))
}

/** Индекс по клавише-стрелке для клавиатурной навигации по точкам графика */
export function stepIndex(
  key: string,
  current: number | null,
  count: number,
  axis: 'x' | 'y' = 'x',
): number | null {
  if (count === 0) return null
  const prev = axis === 'x' ? 'ArrowLeft' : 'ArrowUp'
  const next = axis === 'x' ? 'ArrowRight' : 'ArrowDown'
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === prev) return current === null ? count - 1 : Math.max(0, current - 1)
  if (key === next) return current === null ? 0 : Math.min(count - 1, current + 1)
  return null
}
