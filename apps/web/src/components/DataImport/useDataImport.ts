import { type Impact, importJson } from '@impact-log/core'
import { computed, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { type ImportResult, useImpacts } from '@/composables/useImpacts'
import { useLocale } from '@/composables/useLocale'
import { plural } from '@/utils/insightsFormat'

/** Экспорт на тысячи записей весит единицы мегабайт; больше — почти наверняка не тот файл */
const MAX_FILE_BYTES = 25 * 1024 * 1024

type ImportState =
  | { step: 'idle' }
  | { step: 'error'; reason: 'invalid' | 'tooLarge' | 'empty' | 'failed' }
  | { step: 'parsed'; fileName: string; impacts: Impact[]; invalid: number }
  | { step: 'importing'; fileName: string; impacts: Impact[]; invalid: number }
  | { step: 'done'; result: ImportResult; invalid: number }

/**
 * Импорт своего JSON-экспорта: файл читается в браузере, проверяется схемой ядра (importJson),
 * затем объединяется с текущими записями (merge: совпадающий id обновится, только если в файле версия новее).
 */
export function useDataImport() {
  const { t } = useI18n()
  const { locale } = useLocale()
  const { importMany } = useImpacts()
  const input = ref<HTMLInputElement | null>(null)
  const state = shallowRef<ImportState>({ step: 'idle' })

  function choose() {
    input.value?.click()
  }

  async function onFile(event: Event) {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    target.value = ''
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      state.value = { step: 'error', reason: 'tooLarge' }
      return
    }
    try {
      const { impacts, skipped } = importJson(await file.text())
      state.value =
        impacts.length === 0
          ? { step: 'error', reason: 'empty' }
          : { step: 'parsed', fileName: file.name, impacts, invalid: skipped }
    } catch {
      state.value = { step: 'error', reason: 'invalid' }
    }
  }

  async function confirm() {
    const current = state.value
    if (current.step !== 'parsed') return
    state.value = { ...current, step: 'importing' }
    try {
      const result = await importMany(current.impacts, 'merge')
      state.value = { step: 'done', result, invalid: current.invalid }
    } catch (error) {
      console.error('[import] failed', error)
      state.value = { step: 'error', reason: 'failed' }
    }
  }

  function reset() {
    state.value = { step: 'idle' }
  }

  const entries = (count: number) => plural(t, locale.value, 'insights.units.entries', count)

  const summary = computed(() => {
    const current = state.value
    if (current.step !== 'parsed' && current.step !== 'importing') return null
    return {
      file: current.fileName,
      found: t('data.import.found', { entries: entries(current.impacts.length) }),
      invalid: current.invalid
        ? t('data.import.invalid', { entries: entries(current.invalid) })
        : null,
    }
  })

  const result = computed(() => {
    const current = state.value
    if (current.step !== 'done') return null
    return {
      text: t('data.import.result', {
        added: current.result.added,
        updated: current.result.updated,
        skipped: current.result.skipped,
      }),
      invalid: current.invalid
        ? t('data.import.invalid', { entries: entries(current.invalid) })
        : null,
    }
  })

  return { t, input, state, summary, result, choose, onFile, confirm, reset }
}
