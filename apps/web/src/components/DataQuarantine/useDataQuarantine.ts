import { computed, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocale } from '@/composables/useLocale'
import { datedFilename, downloadText } from '@/utils/download'
import { formatDate, plural } from '@/utils/insightsFormat'
import { localIsoDate } from '@/utils/periodSelection'
import { clearQuarantine, listQuarantine, type QuarantineRecord } from '@/vault'

/**
 * Карантин (src/vault, store quarantine): объекты, которые не расшифровались при смене ключа хранилища.
 * Блок виден, только пока там что-то есть. Скачать — как есть (шифротекст в JSON), удалить — с подтверждением.
 */
export function useDataQuarantine() {
  const { t } = useI18n()
  const { locale } = useLocale()

  const records = shallowRef<QuarantineRecord[]>([])
  const loaded = ref(false)
  const open = ref(false)
  const busy = ref(false)
  const failed = ref(false)
  const cleared = ref(false)

  onMounted(async () => {
    try {
      records.value = await listQuarantine()
    } catch (error) {
      console.warn('[vault] cannot read quarantine', error)
    } finally {
      loaded.value = true
    }
  })

  const count = computed(() => records.value.length)
  /** Блок нужен, пока в карантине что-то есть (и сразу после удаления — чтобы показать итог) */
  const visible = computed(() => loaded.value && (count.value > 0 || cleared.value))
  const objects = computed(() => plural(t, locale.value, 'data.quarantine.units', count.value))

  /** Когда объекты отложены (последняя смена ключа) */
  const since = computed(() => {
    const latest = records.value.reduce<string | null>(
      (max, record) => (max === null || record.quarantinedAt > max ? record.quarantinedAt : max),
      null,
    )
    return latest ? formatDate(locale.value, localIsoDate(new Date(latest))) : null
  })

  function download() {
    const file = {
      format: 'impact-log-quarantine',
      version: 1,
      exportedAt: new Date().toISOString(),
      items: records.value,
    }
    downloadText(datedFilename('json', 'quarantine'), JSON.stringify(file, null, 2), 'json')
  }

  function ask() {
    failed.value = false
    open.value = true
  }

  function cancel() {
    if (!busy.value) open.value = false
  }

  async function confirm() {
    if (busy.value) return
    busy.value = true
    failed.value = false
    try {
      await clearQuarantine()
      records.value = []
      cleared.value = true
      open.value = false
    } catch (error) {
      console.error('[vault] cannot clear quarantine', error)
      failed.value = true
    } finally {
      busy.value = false
    }
  }

  return {
    t,
    visible,
    count,
    objects,
    since,
    cleared,
    open,
    busy,
    failed,
    download,
    ask,
    cancel,
    confirm,
  }
}
