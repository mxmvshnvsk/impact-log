/**
 * Детерминированное округление (половина — от нуля). Все проценты и средние в продукте считаются здесь,
 * а не LLM (ADR-0005, §3).
 */
export function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor
}

/** Доля в процентах; 0, если знаменатель 0 */
export function percent(part: number, total: number, digits = 1): number {
  return total === 0 ? 0 : round((part / total) * 100, digits)
}

export function average(values: readonly number[], digits = 2): number | null {
  if (values.length === 0) return null
  return round(values.reduce((sum, v) => sum + v, 0) / values.length, digits)
}
