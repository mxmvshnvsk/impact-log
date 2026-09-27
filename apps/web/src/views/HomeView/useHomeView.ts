import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTypewriter } from '@/composables/useTypewriter'
import { buildHomeScript } from './homeScript'

export function useHomeView() {
  const { t } = useI18n()
  const script = computed(() => buildHomeScript(t))
  const { lines, done } = useTypewriter(script)

  return { t, lines, done }
}
