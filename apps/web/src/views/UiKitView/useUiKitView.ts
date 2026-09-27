import { ref } from 'vue'
import type { MascotMood } from '@/composables/useMascot'

/** Витрина компонентов (только в dev): /dev/ui */
export function useUiKitView() {
  const moods: MascotMood[] = ['idle', 'watching', 'hiding', 'peeking', 'sleeping', 'happy', 'oops']
  return {
    text: ref('ab'),
    secret: ref('correct horse'),
    otp: ref('12'),
    checked: ref(true),
    moods,
  }
}
