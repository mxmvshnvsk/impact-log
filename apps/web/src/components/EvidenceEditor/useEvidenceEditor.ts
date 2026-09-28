import { type Evidence, evidenceFromUrl } from '@impact-log/core'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { type EvidenceRow, rowKey } from '@/components/ImpactForm/impactFormState'
import { looksLikeUrl, safeHref, shortUrl, withProtocol } from '@/utils/evidence'

export const MAX_EVIDENCE = 20

export type EvidenceEditorProps = {
  modelValue: readonly EvidenceRow[]
  errors: Readonly<Record<string, string>>
}

type Emit = (event: 'update:modelValue', value: EvidenceRow[]) => void

/** Артефакты: ссылка → тип (PR/задача/коммит/документ) определяется сам; без ссылки — заметка */
export function useEvidenceEditor(props: EvidenceEditorProps, emit: Emit) {
  const { t } = useI18n()
  const draft = ref('')

  const full = computed(() => props.modelValue.length >= MAX_EVIDENCE)

  /** Что получится из введённого текста — показываем до добавления */
  const preview = computed<Evidence | null>(() => {
    const value = draft.value.trim()
    if (!value) return null
    return looksLikeUrl(value)
      ? evidenceFromUrl(withProtocol(value))
      : { kind: 'text', excerpt: value.slice(0, 4000) }
  })

  const hint = computed(() => {
    const item = preview.value
    if (!item) return t('impacts.evidence.hint')
    const kind = t(`impacts.evidence.kinds.${item.kind}`)
    return t('impacts.evidence.willAdd', { kind: item.ref ? `${kind} ${item.ref}` : kind })
  })

  function add() {
    const item = preview.value
    if (!item || full.value) return
    emit('update:modelValue', [...props.modelValue, { ...item, key: rowKey() }])
    draft.value = ''
  }

  /** Вставили чистую ссылку в пустое поле — добавляем сразу, без лишнего Enter */
  function onPaste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData('text/plain')?.trim() ?? ''
    if (draft.value.trim() || !text || !/^https?:\/\/\S+$/i.test(text)) return
    event.preventDefault()
    draft.value = text
    add()
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
      add()
    }
  }

  function update(index: number, patch: Partial<Evidence>) {
    emit(
      'update:modelValue',
      props.modelValue.map((item, i) => {
        if (i !== index) return item
        const next = { ...item, ...patch }
        // пустые строки не храним
        if (!next.title?.trim()) delete next.title
        return next
      }),
    )
  }

  function remove(index: number) {
    emit(
      'update:modelValue',
      props.modelValue.filter((_, i) => i !== index),
    )
  }

  function error(index: number): string | null {
    const key = Object.entries(props.errors).find(([path]) =>
      path.startsWith(`evidence.${index}`),
    )?.[1]
    return key ? t(`validation.${key}`) : null
  }

  return {
    t,
    draft,
    full,
    hint,
    preview,
    add,
    onPaste,
    onKeydown,
    update,
    remove,
    error,
    safeHref,
    shortUrl,
    max: MAX_EVIDENCE,
  }
}
