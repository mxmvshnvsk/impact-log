import { type Ref, readonly, ref } from 'vue'

/*
 * Есть ли сеть — по navigator.onLine. Значение true не гарантирует доступ к серверу, но false —
 * надёжный признак офлайна. Синглтон модуля: один набор слушателей на вкладку.
 */
const online = ref(navigator.onLine !== false)
let listening = false

export function useOnline(): Readonly<Ref<boolean>> {
  if (!listening) {
    listening = true
    window.addEventListener('online', () => {
      online.value = true
    })
    window.addEventListener('offline', () => {
      online.value = false
    })
  }
  return readonly(online)
}
