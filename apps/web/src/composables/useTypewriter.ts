import { computed, type MaybeRefOrGetter, onScopeDispose, ref, toValue, watch } from 'vue'
import { type TerminalLine, timelineLength, visibleLines } from '@/utils/typewriter'

type Options = {
  /** Длительность одного тика (≈ скорость печати) */
  tickMs?: number
  /** Задержка перед началом печати */
  startDelayMs?: number
}

/**
 * Проигрывает сценарий терминала. При смене сценария (например, языка) начинает заново.
 * При prefers-reduced-motion показывает всё сразу.
 */
export function useTypewriter(
  script: MaybeRefOrGetter<readonly TerminalLine[]>,
  { tickMs = 45, startDelayMs = 400 }: Options = {},
) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const tick = ref(0)
  let timer: ReturnType<typeof setTimeout> | undefined

  const total = computed(() => timelineLength(toValue(script)))
  const lines = computed(() => visibleLines(toValue(script), tick.value))
  const done = computed(() => tick.value >= total.value)

  function step() {
    if (tick.value >= total.value) return
    tick.value += 1
    timer = setTimeout(step, tickMs)
  }

  function restart() {
    clearTimeout(timer)
    if (reducedMotion) {
      tick.value = total.value
      return
    }
    tick.value = 0
    timer = setTimeout(step, startDelayMs)
  }

  watch(() => toValue(script), restart, { immediate: true })
  onScopeDispose(() => clearTimeout(timer))

  return { lines, done }
}
