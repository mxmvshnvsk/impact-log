/**
 * Модель «печатающегося» терминала. Время измеряется в тиках:
 * команда печатается по символу за тик, вывод появляется целиком после паузы.
 */
export type TerminalLine =
  | { kind: 'command'; text: string }
  | { kind: 'output'; text: string; tone?: 'muted' | 'accent' | 'ok' }

export type VisibleLine = TerminalLine & { done: boolean }

/** Пауза после набранной команды (как будто нажали Enter) */
export const COMMAND_PAUSE_TICKS = 8
/** Пауза перед каждой строкой вывода */
export const OUTPUT_PAUSE_TICKS = 6

export function timelineLength(script: readonly TerminalLine[]): number {
  return script.reduce(
    (total, line) =>
      total +
      (line.kind === 'command' ? line.text.length + COMMAND_PAUSE_TICKS : OUTPUT_PAUSE_TICKS),
    0,
  )
}

/** Какие строки (и какая часть текущей команды) видны на тике `tick` */
export function visibleLines(script: readonly TerminalLine[], tick: number): VisibleLine[] {
  const result: VisibleLine[] = []
  let remaining = tick

  for (const line of script) {
    if (line.kind === 'command') {
      if (remaining <= 0) break
      const typed = Math.min(line.text.length, remaining)
      const done = typed === line.text.length
      result.push({ ...line, text: line.text.slice(0, typed), done })
      if (!done) break
      remaining -= line.text.length + COMMAND_PAUSE_TICKS
    } else {
      if (remaining < OUTPUT_PAUSE_TICKS) break
      result.push({ ...line, done: true })
      remaining -= OUTPUT_PAUSE_TICKS
    }
  }

  return result
}
