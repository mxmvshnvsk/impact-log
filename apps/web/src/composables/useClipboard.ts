import { onScopeDispose, ref } from 'vue'

const COPIED_RESET_MS = 2000

/** Копирование в буфер с флагом «Скопировано» на пару секунд */
export function useClipboard() {
  const copied = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      copied.value = true
      clearTimeout(timer)
      timer = setTimeout(() => {
        copied.value = false
      }, COPIED_RESET_MS)
    } catch {
      copied.value = false
    }
  }

  onScopeDispose(() => clearTimeout(timer))

  return { copied, copy }
}
