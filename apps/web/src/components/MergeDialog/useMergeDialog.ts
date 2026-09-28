import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MergeChoice, MergeRequest } from '@/composables/useAccount'
import { noBreak } from '@/utils/strings'

export type MergeDialogProps = { request: MergeRequest | null }
export type MergeDialogEmits = { choose: [choice: MergeChoice] }
type Emit = (event: 'choose', choice: MergeChoice) => void

type Option = Exclude<MergeChoice, 'cancel'>
const OPTIONS: readonly Option[] = ['merge', 'wipe']

/**
 * Вход в аккаунт с устройства, где есть записи другого хранилища: явный выбор до смены ключа —
 * добавить их в аккаунт, стереть с устройства или отменить вход. По умолчанию — «добавить»
 * (ничего не теряется); «стереть» — опасное действие, кнопка подтверждения красная.
 */
export function useMergeDialog(props: MergeDialogProps, emit: Emit) {
  const { t } = useI18n()
  const choice = ref<Option>('merge')

  // Каждый новый вопрос начинается с безопасного варианта
  watch(
    () => props.request,
    (request) => {
      if (request) choice.value = 'merge'
    },
  )

  const count = computed(() => props.request?.count ?? 0)

  const description = computed(() =>
    props.request
      ? t(
          'auth.merge.text',
          { count: count.value, login: noBreak(props.request.login) },
          count.value,
        )
      : undefined,
  )

  function label(option: Option): string {
    return t(`auth.merge.options.${option}`, { count: count.value }, count.value)
  }

  const confirmLabel = computed(() =>
    choice.value === 'wipe' ? t('auth.merge.confirmWipe') : t('auth.merge.confirmMerge'),
  )

  return {
    t,
    options: OPTIONS,
    choice,
    description,
    label,
    confirmLabel,
    confirm: () => emit('choose', choice.value),
    cancel: () => emit('choose', 'cancel'),
  }
}
