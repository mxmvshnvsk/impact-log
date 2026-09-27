/**
 * Брейкпоинты (ADR-0003). Синхронизированы с src/styles/media.css — меняйте в обоих местах.
 */
export const BREAKPOINTS = {
  tablet: 720,
  desktop: 1200,
} as const

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

export const MEDIA_QUERIES = {
  tablet: `(min-width: ${BREAKPOINTS.tablet}px)`,
  desktop: `(min-width: ${BREAKPOINTS.desktop}px)`,
} as const
