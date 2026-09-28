import { type Impact, TITLE_MAX, todayIso } from '@impact-log/core'
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { QuotaExceededError, useImpacts } from '@/composables/useImpacts'

type Emit = ((event: 'created', impact: Impact) => void) &
  ((event: 'failed') => void) &
  ((event: 'typing', length: number) => void)

const DEFAULT_SCORE = 3
const DONE_VISIBLE_MS = 6000

/** Быстрый ввод: одна строка + оценка → запись с сегодняшней датой; «Подробнее» — в полную форму */
export function useImpactQuickAdd(emit: Emit) {
  const { t } = useI18n()
  const router = useRouter()
  const { create } = useImpacts()

  const title = ref('')
  const score = ref(DEFAULT_SCORE)
  const saving = ref(false)
  const error = ref<string | null>(null)
  const done = ref<Impact | null>(null)
  let doneTimer: ReturnType<typeof setTimeout> | undefined

  function onTitle(value: string) {
    title.value = value
    error.value = null
    emit('typing', value.length)
  }

  async function submit() {
    const value = title.value.trim()
    if (!value) {
      error.value = t('validation.impact.titleRequired')
      emit('failed')
      return
    }
    saving.value = true
    error.value = null
    try {
      const impact = await create({
        title: value.slice(0, TITLE_MAX),
        occurredAt: todayIso(),
        impactScore: score.value,
        categories: [],
        labels: [],
      })
      title.value = ''
      score.value = DEFAULT_SCORE
      done.value = impact
      clearTimeout(doneTimer)
      doneTimer = setTimeout(() => {
        done.value = null
      }, DONE_VISIBLE_MS)
      emit('created', impact)
    } catch (cause) {
      error.value =
        cause instanceof QuotaExceededError
          ? t('impacts.form.errors.quota', { limit: cause.limit })
          : t('impacts.form.errors.saveFailed')
      emit('failed')
    } finally {
      saving.value = false
    }
  }

  /** Перенос в полную форму вместе с набранным текстом и оценкой */
  function details() {
    const query: Record<string, string> = { score: String(score.value) }
    if (title.value.trim()) query.title = title.value.trim()
    void router.push({ name: 'impact-new', query })
  }

  onBeforeUnmount(() => clearTimeout(doneTimer))

  return { t, title, score, saving, error, done, onTitle, submit, details }
}
