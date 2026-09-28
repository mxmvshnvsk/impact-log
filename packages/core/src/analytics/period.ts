/** Период — включительный диапазон дат YYYY-MM-DD */
export type Period = { from: string; to: string }

export const PERIOD_PRESETS = ['month', 'quarter', 'halfYear', 'year', 'all'] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]

const DAY = 24 * 60 * 60 * 1000

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Дата YYYY-MM-DD как полночь UTC — все вычисления по датам в UTC, без часовых поясов */
export function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

export function addDays(value: string, days: number): string {
  return toIsoDate(new Date(parseIsoDate(value).getTime() + days * DAY))
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / DAY)
}

/** Пресеты «последние N» заканчиваются сегодняшним днём */
export function presetPeriod(preset: PeriodPreset, today: string, earliest?: string): Period {
  switch (preset) {
    case 'month':
      return { from: addDays(today, -29), to: today }
    case 'quarter':
      return { from: addDays(today, -89), to: today }
    case 'halfYear':
      return { from: addDays(today, -181), to: today }
    case 'year':
      return { from: addDays(today, -364), to: today }
    case 'all':
      return { from: earliest && earliest < today ? earliest : today, to: today }
  }
}

/** Предыдущий период той же длины — для сравнения */
export function previousPeriod(period: Period): Period {
  const length = daysBetween(period.from, period.to) + 1
  return { from: addDays(period.from, -length), to: addDays(period.from, -1) }
}

export function inPeriod(date: string, period: Period): boolean {
  return date >= period.from && date <= period.to
}

/** Понедельник недели, в которую попадает дата (ISO-неделя) */
export function startOfWeek(date: string): string {
  const day = parseIsoDate(date).getUTCDay() // 0 = воскресенье
  return addDays(date, -((day + 6) % 7))
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`
}
