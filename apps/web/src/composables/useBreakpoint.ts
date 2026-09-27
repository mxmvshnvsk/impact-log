import { computed, onScopeDispose, ref } from 'vue'
import { MEDIA_QUERIES } from '@/constants/breakpoints'
import { resolveBreakpoint } from '@/utils/breakpoint'

/**
 * Текущий брейкпоинт в JS. Нужен, только когда на разных экранах рендерятся разные компоненты;
 * для всего остального — CSS и @media (--tablet) / (--desktop).
 */
export function useBreakpoint() {
  const tabletQuery = window.matchMedia(MEDIA_QUERIES.tablet)
  const desktopQuery = window.matchMedia(MEDIA_QUERIES.desktop)

  const tablet = ref(tabletQuery.matches)
  const desktop = ref(desktopQuery.matches)

  const onTabletChange = (event: MediaQueryListEvent) => {
    tablet.value = event.matches
  }
  const onDesktopChange = (event: MediaQueryListEvent) => {
    desktop.value = event.matches
  }

  tabletQuery.addEventListener('change', onTabletChange)
  desktopQuery.addEventListener('change', onDesktopChange)
  onScopeDispose(() => {
    tabletQuery.removeEventListener('change', onTabletChange)
    desktopQuery.removeEventListener('change', onDesktopChange)
  })

  const breakpoint = computed(() =>
    resolveBreakpoint({ tablet: tablet.value, desktop: desktop.value }),
  )

  return {
    breakpoint,
    isMobile: computed(() => breakpoint.value === 'mobile'),
    isTablet: computed(() => breakpoint.value === 'tablet'),
    isDesktop: computed(() => breakpoint.value === 'desktop'),
  }
}
