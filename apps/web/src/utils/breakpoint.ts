import type { Breakpoint } from '@/constants/breakpoints'

/** Определяет текущий брейкпоинт по результатам медиазапросов (mobile-first) */
export function resolveBreakpoint(matches: { tablet: boolean; desktop: boolean }): Breakpoint {
  if (matches.desktop) return 'desktop'
  if (matches.tablet) return 'tablet'
  return 'mobile'
}
