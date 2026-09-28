import { z } from 'zod'

/** Измеримый результат: «время сборки 6 → 2 мин», «конверсия +3%» */
export const metricSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: z.number().finite(),
  unit: z.string().trim().max(20).optional(),
  /** Значение «до» — для дельты */
  baseline: z.number().finite().optional(),
})
export type Metric = z.infer<typeof metricSchema>

/** Дельта относительно baseline (null, если baseline не задан) */
export function metricDelta(metric: Metric): number | null {
  return metric.baseline === undefined ? null : metric.value - metric.baseline
}
