import { filterImpacts, type Impact } from '@impact-log/core'
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocale } from '@/composables/useLocale'
import { formatDate, plural } from '@/utils/insightsFormat'

export type ReviewPickerProps = {
  /** Записи, подходящие под период и минимальную оценку */
  candidates: readonly Impact[]
  /** Снятые вручную */
  excluded: ReadonlySet<string>
}

type Emit = (event: 'update:excluded', value: ReadonlySet<string>) => void

/** Ручной выбор записей для отчёта: по умолчанию выбраны все подходящие */
export function useReviewPicker(props: ReviewPickerProps, emit: Emit) {
  const { t } = useI18n()
  const { locale } = useLocale()
  const panelId = useId()
  const open = ref(false)
  const query = ref('')

  const filtered = computed(() => filterImpacts(props.candidates, { query: query.value }))

  const rows = computed(() =>
    filtered.value.map((impact) => ({
      id: impact.objectId,
      title: impact.title,
      meta: `${formatDate(locale.value, impact.occurredAt)} · ${t('review.picker.score', { score: impact.impactScore })}`,
      checked: !props.excluded.has(impact.objectId),
    })),
  )

  const selected = computed(
    () => props.candidates.filter((impact) => !props.excluded.has(impact.objectId)).length,
  )

  const summary = computed(() =>
    t('review.picker.summary', {
      selected: selected.value,
      total: plural(t, locale.value, 'review.picker.totalOf', props.candidates.length),
    }),
  )

  function toggle(id: string, checked: boolean) {
    const next = new Set(props.excluded)
    if (checked) next.delete(id)
    else next.add(id)
    emit('update:excluded', next)
  }

  /** «Выбрать все» / «Снять все» — только среди найденных поиском */
  function setAll(checked: boolean) {
    const next = new Set(props.excluded)
    for (const impact of filtered.value) {
      if (checked) next.delete(impact.objectId)
      else next.add(impact.objectId)
    }
    emit('update:excluded', next)
  }

  return { t, panelId, open, query, rows, summary, toggle, setAll }
}
