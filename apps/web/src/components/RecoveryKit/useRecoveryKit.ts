import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { downloadTextFile, matchesKeyTail, recoveryKitText } from '@/account'
import { useClipboard } from '@/composables/useClipboard'

export type RecoveryKitProps = {
  /** ILRK1-… — показывается один раз, никуда не сохраняется */
  recoveryKey: string
  login: string
}

const PRINT_CLASS = 'il-print-kit'

/**
 * Recovery Kit: ключ крупно, скачать/печать/копировать и подтверждение «сохранил» —
 * флажок + последние 4 символа ключа (проверяем, что ключ действительно записан).
 */
export function useRecoveryKit(props: RecoveryKitProps) {
  const { t, tm, rt, locale } = useI18n()
  const clipboard = useClipboard()

  const groups = computed(() => props.recoveryKey.split('-'))
  /** Для скринридера — по символу, чтобы ключ можно было записать на слух */
  const spelled = computed(() => props.recoveryKey.split('').join(' '))
  const createdAt = computed(() =>
    new Intl.DateTimeFormat(locale.value, { dateStyle: 'long', timeStyle: 'short' }).format(
      new Date(),
    ),
  )
  const instructions = computed(() =>
    (tm('auth.recoveryKit.file.instructions') as unknown[]).map((line) =>
      rt(line as Parameters<typeof rt>[0]),
    ),
  )

  function fileText() {
    return recoveryKitText(
      {
        title: t('auth.recoveryKit.file.title'),
        loginLabel: t('auth.recoveryKit.file.login'),
        createdLabel: t('auth.recoveryKit.file.created'),
        keyLabel: t('auth.recoveryKit.file.key'),
        instructions: instructions.value,
      },
      props.login,
      createdAt.value,
      props.recoveryKey,
    )
  }

  function download() {
    downloadTextFile(`impact-log-recovery-key-${props.login || 'account'}.txt`, fileText())
  }

  function cleanupPrint() {
    document.documentElement.classList.remove(PRINT_CLASS)
  }

  function print() {
    document.documentElement.classList.add(PRINT_CLASS)
    window.addEventListener('afterprint', cleanupPrint, { once: true })
    window.print()
  }

  onBeforeUnmount(() => {
    cleanupPrint()
    window.removeEventListener('afterprint', cleanupPrint)
  })

  // ---------- подтверждение ----------
  const saved = ref(false)
  const tail = ref('')
  const savedError = ref<string | null>(null)
  const tailError = ref<string | null>(null)
  const tailRef = ref<{ focus: () => void } | null>(null)
  let tailChecked = false

  function checkTail(): boolean {
    const ok = matchesKeyTail(props.recoveryKey, tail.value)
    if (ok) tailError.value = null
    else
      tailError.value = t(
        tail.value.trim() ? 'auth.recoveryKit.tailError' : 'auth.recoveryKit.tailRequired',
      )
    return ok
  }

  function onTailBlur() {
    if (!tail.value) return
    tailChecked = true
    checkTail()
  }

  watch(tail, () => {
    if (tailChecked) checkTail()
  })
  watch(saved, (value) => {
    if (value) savedError.value = null
  })
  // Новый ключ (например, после смены логина) — подтверждение заново
  watch(
    () => props.recoveryKey,
    () => {
      saved.value = false
      tail.value = ''
      tailError.value = null
      tailChecked = false
    },
  )

  /** Проверка перед «Дальше»: флажок и совпадение хвоста ключа */
  function validate(): boolean {
    tailChecked = true
    const tailOk = checkTail()
    savedError.value = saved.value ? null : t('auth.recoveryKit.savedRequired')
    if (!tailOk) tailRef.value?.focus()
    return saved.value && tailOk
  }

  return {
    t,
    groups,
    spelled,
    createdAt,
    instructions,
    copied: clipboard.copied,
    copy: () => clipboard.copy(props.recoveryKey),
    download,
    print,
    saved,
    savedError,
    tail,
    tailError,
    tailRef,
    onTailBlur,
    validate,
  }
}
