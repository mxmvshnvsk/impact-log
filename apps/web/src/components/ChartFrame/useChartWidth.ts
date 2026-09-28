import { onBeforeUnmount, onMounted, type Ref, ref } from 'vue'

/**
 * Ширина контейнера графика. SVG рисуется в реальных пикселях (viewBox = ширина, width 100%),
 * поэтому кегль подписей не «плавает» вместе с масштабом, а их плотность подбирается под экран.
 */
export function useChartWidth(target: Ref<HTMLElement | null>, fallback = 640) {
  const width = ref(fallback)
  let observer: ResizeObserver | null = null

  onMounted(() => {
    const el = target.value
    if (!el) return
    width.value = Math.max(1, Math.floor(el.clientWidth)) || fallback
    observer = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0]?.contentRect.width ?? 0)
      if (next > 0 && next !== width.value) width.value = next
    })
    observer.observe(el)
  })

  onBeforeUnmount(() => observer?.disconnect())

  return width
}
