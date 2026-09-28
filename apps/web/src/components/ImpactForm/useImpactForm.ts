import { DESCRIPTION_MAX, type ImpactInput, TITLE_MAX, vocabulary } from '@impact-log/core'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave } from 'vue-router'
import { QuotaExceededError, useImpacts } from '@/composables/useImpacts'
import { isSubmitShortcut } from '@/utils/keyboard'
import {
  type FormErrors,
  type ImpactFormState,
  snapshot,
  toFormState,
  validateForm,
} from './impactFormState'

/** Сохранение делает родитель (создать/обновить и перейти); ошибка → сообщение над кнопками */
export type ImpactFormSave = (input: ImpactInput) => Promise<void>

export type ImpactFormProps = {
  initial: Partial<ImpactInput>
  save: ImpactFormSave
  submitLabel: string
  /** Показать кнопку «Удалить» (редактирование) */
  deletable?: boolean
  /** Содержимое ещё нигде не сохранено (черновик захвата): отмена и уход — всегда с подтверждением */
  draft?: boolean
}

type Emit = ((event: 'cancel') => void) & ((event: 'delete') => void)

type TopField = 'title' | 'occurredAt' | 'description' | 'categories' | 'labels'

/**
 * Форма записи по правилам docs/design-system.md («Формы»): проверка при потере фокуса, после первой
 * ошибки — на каждый ввод, при отправке — всё и фокус на первое неверное поле. Cmd/Ctrl+Enter — сохранить,
 * Esc — отмена (с подтверждением, если есть изменения); уход со страницы с изменениями — тоже с подтверждением.
 */
export function useImpactForm(props: ImpactFormProps, emit: Emit) {
  const { t } = useI18n()
  const { list: impacts } = useImpacts()

  const formRef = ref<HTMLFormElement | null>(null)
  const state = reactive<ImpactFormState>(toFormState(props.initial))
  const errors = reactive<FormErrors>({})
  const saving = ref(false)
  const formError = ref<string | null>(null)
  const descriptionMode = ref<'write' | 'preview'>('write')

  let initialSnapshot = snapshot(state)
  const saved = ref(false)
  const dirty = computed(() => (props.draft && !saved.value) || snapshot(state) !== initialSnapshot)

  /** Разрешить уход без вопроса (сохранено / удалено / пользователь подтвердил) */
  let allowLeave = false
  const discardOpen = ref(false)
  let pendingLeave: ((allow: boolean) => void) | null = null

  const vocab = computed(() => vocabulary(impacts.value))

  /* ---------- валидация ---------- */

  function setErrors(next: FormErrors, paths?: readonly string[]) {
    const keys = paths ?? Object.keys({ ...errors, ...next })
    for (const key of keys) {
      if (next[key]) errors[key] = next[key]
      else delete errors[key]
    }
  }

  /** Поле проверяется при потере фокуса; пустое обязательное — не ругаем до отправки */
  function onBlur(path: string) {
    if (path === 'title' && !state.title.trim() && !errors.title) return
    const { errors: next } = validateForm(state)
    setErrors(next, [path])
  }

  // После первой ошибки поле перепроверяется на каждый ввод
  watch(state, () => {
    formError.value = null
    const shown = Object.keys(errors)
    if (!shown.length) return
    const { errors: next } = validateForm(state)
    setErrors(next, shown)
  })

  function fieldError(path: TopField | string): string | null {
    const key = errors[path]
    return key ? t(`validation.${key}`) : null
  }

  /* ---------- отправка ---------- */

  async function submit() {
    if (saving.value) return
    formError.value = null
    const { input, errors: next } = validateForm(state)
    setErrors(next)
    if (Object.keys(next).length) {
      if (next.description) descriptionMode.value = 'write'
      await nextTick()
      formRef.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    saving.value = true
    allowLeave = true
    try {
      await props.save(input)
      initialSnapshot = snapshot(state)
      saved.value = true
    } catch (error) {
      allowLeave = false
      console.error('[impact-form] save failed', error)
      formError.value =
        error instanceof QuotaExceededError
          ? t('impacts.form.errors.quota', { limit: error.limit })
          : t('impacts.form.errors.saveFailed')
    } finally {
      saving.value = false
    }
  }

  /* ---------- отмена и уход со страницы ---------- */

  function cancel() {
    if (dirty.value) {
      discardOpen.value = true
      return
    }
    allowLeave = true
    emit('cancel')
  }

  function confirmDiscard() {
    discardOpen.value = false
    allowLeave = true
    if (pendingLeave) {
      pendingLeave(true)
      pendingLeave = null
    } else {
      emit('cancel')
    }
  }

  function keepEditing() {
    discardOpen.value = false
    pendingLeave?.(false)
    pendingLeave = null
  }

  onBeforeRouteLeave(() => {
    if (allowLeave || !dirty.value) return true
    discardOpen.value = true
    return new Promise<boolean>((resolve) => {
      pendingLeave = resolve
    })
  })

  /** Родитель уходит со страницы сам (например, после удаления) */
  function release() {
    allowLeave = true
  }

  /* ---------- клавиатура ---------- */

  function onWindowKeydown(event: KeyboardEvent) {
    if (discardOpen.value || document.querySelector('dialog[open]')) return
    if (isSubmitShortcut(event)) {
      event.preventDefault()
      void submit()
    } else if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault()
      cancel()
    }
  }

  /** Enter в однострочных полях не отправляет длинную форму (только кнопка или Cmd/Ctrl+Enter) */
  function onFormKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement
    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && target.tagName === 'INPUT') {
      event.preventDefault()
    }
  }

  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (dirty.value && !allowLeave) event.preventDefault()
  }

  onMounted(() => {
    // новая запись — сразу печатаем заголовок
    if (!state.title) formRef.value?.querySelector<HTMLInputElement>('input[name="title"]')?.focus()
    window.addEventListener('keydown', onWindowKeydown)
    window.addEventListener('beforeunload', onBeforeUnload)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onWindowKeydown)
    window.removeEventListener('beforeunload', onBeforeUnload)
  })

  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ Enter' : 'Ctrl + Enter'

  return {
    t,
    formRef,
    state,
    errors,
    saving,
    formError,
    dirty,
    descriptionMode,
    vocab,
    discardOpen,
    shortcut,
    titleMax: TITLE_MAX,
    descriptionMax: DESCRIPTION_MAX,
    onBlur,
    fieldError,
    submit,
    cancel,
    confirmDiscard,
    keepEditing,
    release,
    onFormKeydown,
  }
}
