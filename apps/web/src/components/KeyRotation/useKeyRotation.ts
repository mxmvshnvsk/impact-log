import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorKey } from '@/account'
import type { AccountStage } from '@/composables/useAccount'
import { useKeyRotation as useRotationFlow } from '@/composables/useKeyRotation'
import { useVault } from '@/composables/useVault'
import { countActive } from '@/vault'

export type KeyRotationEmits = { close: [] }
type Emit = (event: 'close') => void

/** Что показывает раздел: локальные шаги до начала или общее состояние ротации (useKeyRotation) */
export type KeyRotationView =
  | 'explain'
  | 'password'
  | 'kit'
  | 'running'
  | 'failed'
  | 'unfinished'
  | 'other'
  | 'done'
  | 'notice'

const STEPS = ['sync', 'encrypt', 'commit', 'finish'] as const

/**
 * «Сменить ключ шифрования» (ADR-0012) в Настройки → Безопасность: объяснение → текущий пароль →
 * новый Recovery Key (до start) → прогресс → готово. Плюс состояния, пришедшие извне: незавершённая ротация
 * этого устройства (продолжить / отменить), ротация на другом устройстве (отменить паролем), итог отмены.
 */
export function useKeyRotation(emit: Emit) {
  const { t, locale } = useI18n()
  const vault = useVault()
  const flow = useRotationFlow()

  const step = ref<'explain' | 'password'>('explain')
  const count = ref<number | null>(null)
  const password = ref('')
  const passwordError = ref<string | null>(null)
  const passwordRef = ref<{ focus: () => void } | null>(null)
  const stage = ref<AccountStage | null>(null)
  const formError = ref<string | null>(null)
  const kitRef = ref<{ validate: () => boolean } | null>(null)

  onMounted(async () => {
    count.value = await countActive('impact').catch(() => null)
  })

  const view = computed<KeyRotationView>(() => {
    const phase = flow.phase.value
    if (phase === 'starting' || phase === 'running') return 'running'
    if (phase === 'kit') return 'kit'
    if (phase === 'done') return 'done'
    if (phase === 'failed') return 'failed'
    if (phase === 'preparing') return 'password'
    if (flow.unfinished.value) return 'unfinished'
    if (flow.otherDevice.value) return 'other'
    if (flow.notice.value) return 'notice'
    return step.value
  })

  const dateFormat = computed(
    () => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }),
  )
  const format = (iso: string | undefined) => (iso ? dateFormat.value.format(new Date(iso)) : '')

  // ---------- объяснение и пароль ----------
  async function toPassword() {
    step.value = 'password'
    formError.value = null
    await nextTick()
    passwordRef.value?.focus()
  }

  watch(password, () => {
    passwordError.value = null
    formError.value = null
  })

  async function submitPassword() {
    if (flow.busy.value) return
    if (!password.value) {
      passwordError.value = t('validation.password.required')
      return
    }
    const current = password.value
    password.value = ''
    formError.value = null
    try {
      await flow.prepare(current, (next) => {
        stage.value = next
      })
    } catch (cause) {
      const key = errorKey(cause, 'reauth')
      if (key === 'errors.WRONG_PASSWORD') {
        passwordError.value = t(key)
        await nextTick()
        passwordRef.value?.focus()
      } else formError.value = key
    } finally {
      stage.value = null
    }
  }

  function cancel() {
    flow.discardPrepared()
    step.value = 'explain'
    password.value = ''
    formError.value = null
    emit('close')
  }

  // ---------- новый Recovery Key ----------
  async function confirmKit() {
    if (!kitRef.value?.validate()) return
    await flow.confirmKit()
  }

  // ---------- прогресс ----------
  const progress = computed(() => {
    const current = flow.progress.value
    const index = flow.phase.value === 'starting' ? 0 : 1 + STEPS.indexOf(current?.step ?? 'sync')
    const attempt = current?.attempt ?? 1
    const steps = ['starting' as const, ...STEPS].map((key, position) => {
      let label = t(`account.keyRotation.progress.${key}`)
      if (key === 'encrypt') {
        if (attempt > 1) label = t('account.keyRotation.progress.commitRetry', { n: attempt })
        else if (current?.step === 'encrypt' && current.total > 0)
          label = t('account.keyRotation.progress.encrypt', {
            done: current.done,
            total: current.total,
          })
        else label = t('account.keyRotation.progress.encryptEmpty')
      }
      const state = position < index ? 'done' : position === index ? 'active' : 'todo'
      return { key, label, state }
    })
    return { steps, value: flow.percent.value }
  })

  // ---------- незавершённая ротация / сбой ----------
  const abortOpen = ref(false)
  const aborting = ref(false)

  function askAbort() {
    abortOpen.value = true
  }

  async function confirmAbort() {
    if (aborting.value) return
    aborting.value = true
    try {
      await flow.abort()
    } finally {
      aborting.value = false
      abortOpen.value = false
    }
  }

  function retry() {
    void flow.resume()
  }

  // ---------- ротация на другом устройстве ----------
  const otherOpen = ref(false)
  const otherPassword = ref('')
  const otherPasswordError = ref<string | null>(null)
  const otherBusy = ref(false)
  const otherStage = ref<AccountStage | null>(null)
  const otherError = ref<string | null>(null)

  watch(otherPassword, () => {
    otherPasswordError.value = null
    otherError.value = null
  })

  async function abortOther() {
    if (otherBusy.value) return
    if (!otherPassword.value) {
      otherPasswordError.value = t('validation.password.required')
      return
    }
    const current = otherPassword.value
    otherPassword.value = ''
    otherBusy.value = true
    try {
      await flow.abortOther(current, (next) => {
        otherStage.value = next
      })
      otherOpen.value = false
    } catch (cause) {
      const key = errorKey(cause, 'reauth')
      if (key === 'errors.WRONG_PASSWORD') otherPasswordError.value = t(key)
      else otherError.value = key
    } finally {
      otherBusy.value = false
      otherStage.value = null
    }
  }

  function close() {
    flow.dismiss()
    step.value = 'explain'
    emit('close')
  }

  return {
    t,
    view,
    login: computed(() => vault.account.value?.login ?? ''),
    count,
    busy: flow.busy,
    preparing: computed(() => flow.phase.value === 'preparing'),
    toPassword,
    password,
    passwordError,
    passwordRef,
    stage,
    formError,
    submitPassword,
    cancel,
    kit: flow.kit,
    kitRef,
    confirmKit,
    progress,
    error: flow.error,
    notice: flow.notice,
    unfinishedAt: computed(() => format(flow.unfinished.value?.startedAt)),
    abortOpen,
    aborting,
    askAbort,
    confirmAbort,
    retry,
    otherAt: computed(() => format(flow.otherDevice.value?.startedAt)),
    otherOpen,
    otherPassword,
    otherPasswordError,
    otherBusy,
    otherStage,
    otherError,
    abortOther,
    close,
  }
}
