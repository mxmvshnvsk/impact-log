import { exportJson, type Impact } from '@impact-log/core'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useImpacts } from '@/composables/useImpacts'
import { useLocale } from '@/composables/useLocale'
import { useVault } from '@/composables/useVault'
import { datedFilename, downloadText } from '@/utils/download'
import { plural } from '@/utils/insightsFormat'

/**
 * «Опасная зона»: стереть хранилище на этом устройстве. Подтверждение — вводом слова,
 * перед этим можно одним нажатием скачать JSON-бэкап. Данные на сервере не трогаем.
 */
export function useDataDanger() {
  const { t } = useI18n()
  const { locale } = useLocale()
  const router = useRouter()
  const { impacts, count } = useImpacts()
  const { account, destroy } = useVault()

  const open = ref(false)
  const typed = ref('')
  const busy = ref(false)
  const failed = ref(false)

  const word = computed(() => t('data.danger.word'))
  const matches = computed(
    () => typed.value.trim().toLocaleLowerCase() === word.value.toLocaleLowerCase(),
  )

  const description = computed(() =>
    t('data.danger.dialogText', {
      entries: plural(t, locale.value, 'insights.units.entries', count.value),
    }),
  )

  function start() {
    typed.value = ''
    failed.value = false
    open.value = true
  }

  function cancel() {
    if (!busy.value) open.value = false
  }

  function backup() {
    downloadText(datedFilename('json'), exportJson(impacts.value as readonly Impact[]), 'json')
  }

  async function confirm() {
    if (!matches.value || busy.value) return
    busy.value = true
    failed.value = false
    try {
      await destroy()
      open.value = false
      await router.replace({ name: 'landing' })
    } catch (error) {
      console.error('[vault] destroy failed', error)
      failed.value = true
    } finally {
      busy.value = false
    }
  }

  return {
    t,
    account,
    count,
    open,
    typed,
    busy,
    failed,
    word,
    matches,
    description,
    start,
    cancel,
    backup,
    confirm,
  }
}
