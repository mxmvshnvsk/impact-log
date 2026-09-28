import { onMounted, ref, useId, watch } from 'vue'

export type UiDialogProps = {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  cancelLabel: string
  tone?: 'default' | 'danger'
  loading?: boolean
  confirmDisabled?: boolean
}

export type UiDialogEmits = { confirm: []; cancel: [] }

type Emit = ((event: 'confirm') => void) & ((event: 'cancel') => void)

/**
 * Модальное подтверждение на нативном <dialog> + showModal(): фокус-ловушка, инертный фон,
 * Esc — браузерные. Открытием управляет родитель через prop open.
 */
export function useUiDialog(props: UiDialogProps, emit: Emit) {
  const dialogRef = ref<HTMLDialogElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  function sync(open: boolean) {
    const el = dialogRef.value
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }

  watch(() => props.open, sync, { flush: 'post' })
  onMounted(() => sync(props.open))

  function cancel() {
    if (!props.loading) emit('cancel')
  }

  /** Esc: закрываем сами через prop, чтобы состояние не разъехалось */
  function onCancelEvent(event: Event) {
    event.preventDefault()
    cancel()
  }

  /** Браузер мог закрыть диалог сам (повторный Esc) — сообщаем родителю */
  function onClose() {
    if (props.open) emit('cancel')
  }

  /** Клик по подложке: панель заполняет весь <dialog>, так что target === dialog — это ::backdrop */
  function onClick(event: MouseEvent) {
    if (event.target === dialogRef.value) cancel()
  }

  return { dialogRef, titleId, descriptionId, cancel, onCancelEvent, onClose, onClick }
}
