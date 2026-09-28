import { DEFAULT_REVIEW_OPTIONS, IMPACT_SCORE_MAX, IMPACT_SCORE_MIN } from '@impact-log/core'
import { z } from 'zod'

/**
 * Предпочтения конструктора ревью в localStorage. Только настройки вида отчёта —
 * ни записей, ни заголовка, ни выбранных id (это данные, они живут только в зашифрованном хранилище).
 */
export const REVIEW_PREFERENCES_KEY = 'impact-log:review-options'

export const HIGHLIGHT_CHOICES = [0, 3, 5, 10] as const

const preferencesSchema = z.object({
  groupBy: z.enum(['category', 'month', 'none']),
  minScore: z.number().int().min(IMPACT_SCORE_MIN).max(IMPACT_SCORE_MAX),
  highlights: z.number().int().min(0).max(20),
  includeDescriptions: z.boolean(),
  includeMetrics: z.boolean(),
  includeEvidence: z.boolean(),
})

export type ReviewPreferences = z.infer<typeof preferencesSchema>

export const DEFAULT_REVIEW_PREFERENCES: ReviewPreferences = {
  groupBy: DEFAULT_REVIEW_OPTIONS.groupBy,
  minScore: DEFAULT_REVIEW_OPTIONS.minScore,
  highlights: DEFAULT_REVIEW_OPTIONS.highlights,
  includeDescriptions: DEFAULT_REVIEW_OPTIONS.includeDescriptions,
  includeMetrics: DEFAULT_REVIEW_OPTIONS.includeMetrics,
  includeEvidence: DEFAULT_REVIEW_OPTIONS.includeEvidence,
}

export function readReviewPreferences(): ReviewPreferences {
  try {
    const raw = localStorage.getItem(REVIEW_PREFERENCES_KEY)
    if (!raw) return { ...DEFAULT_REVIEW_PREFERENCES }
    const parsed = preferencesSchema.partial().safeParse(JSON.parse(raw))
    return parsed.success
      ? { ...DEFAULT_REVIEW_PREFERENCES, ...parsed.data }
      : { ...DEFAULT_REVIEW_PREFERENCES }
  } catch {
    return { ...DEFAULT_REVIEW_PREFERENCES }
  }
}

export function writeReviewPreferences(preferences: ReviewPreferences): void {
  try {
    localStorage.setItem(REVIEW_PREFERENCES_KEY, JSON.stringify(preferences))
  } catch {
    // приватный режим / запрет хранилища — просто не запоминаем
  }
}
