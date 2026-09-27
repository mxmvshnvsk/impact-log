import { computed, onScopeDispose, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { prefersReducedMotion } from '@/utils/motion'

export type MascotMood = 'idle' | 'watching' | 'hiding' | 'peeking' | 'sleeping' | 'happy' | 'oops'
export type MascotAction = 'tilt' | 'hop' | 'look-around' | 'glitch'
/** Какое поле сейчас в фокусе: логин — маскот следит, секреты — закрывает глаза */
export type MascotField = 'login' | 'secret' | 'password'

const IDLE_ACTION_AFTER_MS = 5_000
const SLEEP_AFTER_MS = 45_000
const ACTION_DURATION_MS = 1_800
const FLASH_DURATION_MS = 1_600
const TICK_MS = 1_000
/** Сколько символов логина нужно, чтобы взгляд дошёл до правого края */
const LOOK_RANGE_CHARS = 22

const ACTIONS: MascotAction[] = ['tilt', 'hop', 'look-around', 'glitch']

/**
 * Контроллер маскота на формах авторизации.
 * Форма сообщает о фокусе/вводе/результате — контроллер решает, что делает маскот.
 */
export function useMascot() {
  const { t } = useI18n()
  const reducedMotion = prefersReducedMotion()

  const field = ref<MascotField | null>(null)
  const valueLength = ref(0)
  const revealed = ref(false)
  const flash = ref<'happy' | 'oops' | null>(null)
  const action = ref<MascotAction | null>(null)
  const sleeping = ref(false)
  let lastActivity = Date.now()
  let flashTimer: ReturnType<typeof setTimeout> | undefined

  const mood = computed<MascotMood>(() => {
    if (flash.value) return flash.value
    if (sleeping.value) return 'sleeping'
    if (field.value === 'password') return revealed.value ? 'peeking' : 'hiding'
    if (field.value === 'secret') return 'hiding'
    if (field.value === 'login') return 'watching'
    return 'idle'
  })

  const look = computed(() => Math.min(1, (valueLength.value / LOOK_RANGE_CHARS) * 2 - 1))
  const message = computed(() => t(`mascot.${mood.value}`))

  function touch() {
    lastActivity = Date.now()
    sleeping.value = false
  }

  function focus(next: MascotField) {
    touch()
    action.value = null
    field.value = next
  }

  function blur() {
    touch()
    field.value = null
  }

  function input(length: number) {
    touch()
    valueLength.value = length
  }

  function reveal(value: boolean) {
    touch()
    revealed.value = value
  }

  function react(kind: 'happy' | 'oops') {
    touch()
    flash.value = kind
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => {
      flash.value = null
    }, FLASH_DURATION_MS)
  }

  // Жизнь в ожидании: время от времени что-то делает, через 45 секунд засыпает
  const ticker = setInterval(() => {
    if (field.value || flash.value || reducedMotion) return
    const idleFor = Date.now() - lastActivity
    if (idleFor > SLEEP_AFTER_MS) {
      sleeping.value = true
      action.value = null
      return
    }
    if (idleFor > IDLE_ACTION_AFTER_MS && !action.value && Math.random() < 0.3) {
      action.value = ACTIONS[Math.floor(Math.random() * ACTIONS.length)] ?? null
      setTimeout(() => {
        action.value = null
      }, ACTION_DURATION_MS)
    }
  }, TICK_MS)

  const wake = () => touch()
  window.addEventListener('pointermove', wake, { passive: true })
  window.addEventListener('keydown', wake)

  onScopeDispose(() => {
    clearInterval(ticker)
    clearTimeout(flashTimer)
    window.removeEventListener('pointermove', wake)
    window.removeEventListener('keydown', wake)
  })

  return { mood, look, action, message, focus, blur, input, reveal, react }
}

export type Mascot = ReturnType<typeof useMascot>

/** То, что нужно для отрисовки совы (без методов) */
export type MascotView = {
  mood: MascotMood
  look: number
  action: MascotAction | null
  message: string
}
