import {
  CAPTURE_PATH,
  draftToImpactInput,
  type ImpactDraft,
  type ImpactInput,
} from '@impact-log/core'
import { Chrome, Globe, SquareCode, Terminal } from 'lucide-vue-next'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useImpacts } from '@/composables/useImpacts'
import { useVault } from '@/composables/useVault'
import { CLIENT_LINKS } from '@/constants/links'
import {
  clearHandoffFromUrl,
  clearStashedDraft,
  readHandoff,
  readStashedDraft,
  stashDraft,
} from '@/utils/captureHandoff'
import { hostOf, safeHref } from '@/utils/evidence'
import { findCapture, getObject, rememberCapture } from '@/vault'

/** label: null — подпись из i18n (capture.fromWeb: «из веб-приложения»); названия продуктов не переводим */
const SOURCES = {
  chrome: { label: 'Chrome', icon: Chrome },
  cli: { label: 'CLI', icon: Terminal },
  vscode: { label: 'VS Code', icon: SquareCode },
  web: { label: null, icon: Globe },
} as const

/*
 * Черновик в памяти модуля: при создании хранилища каркас страницы меняется (public → app) и экран
 * монтируется заново — черновик не должен потеряться.
 */
let memoryDraft: ImpactDraft | null = null

/** Быстрый захват: /capture#draft=… → проверка в форме → зашифрованная запись */
export function useCaptureView() {
  const { t } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const vault = useVault()
  const { create } = useImpacts()

  const draft = shallowRef<ImpactDraft | null>(null)
  const invalid = ref(false)

  /** Прочитать черновик из фрагмента (или из памяти/sessionStorage, если фрагмента нет) */
  function consume(hash: string) {
    const handoff = readHandoff(hash)
    if (handoff.status !== 'none') void clearHandoffFromUrl(router, CAPTURE_PATH)
    if (handoff.status === 'draft') memoryDraft = handoff.draft
    invalid.value = handoff.status === 'invalid'
    draft.value = invalid.value ? null : (memoryDraft ?? readStashedDraft())
    // Без хранилища впереди онбординг (создание или вход) — страхуем черновик в sessionStorage вкладки
    if (draft.value && !vault.hasVault.value) stashDraft(draft.value)
  }

  consume(window.location.hash)
  // Новая ссылка захвата в той же вкладке (меняется только фрагмент) — экран не пересоздаётся
  watch(
    () => route.hash,
    (hash) => {
      if (hash) consume(hash)
    },
  )

  /* ---------- повторное открытие той же ссылки ---------- */

  /** Запись, в которую этот черновик уже сохранён (защита от дубликатов) */
  const duplicateOf = ref<string | null>(null)
  const saveAgain = ref(false)

  function allowSaveAgain() {
    saveAgain.value = true
  }

  watch(
    [() => draft.value?.draftId, vault.hasVault],
    async ([draftId, hasVault]) => {
      duplicateOf.value = null
      saveAgain.value = false
      if (!draftId || !hasVault) return
      const objectId = await findCapture(draftId).catch(() => null)
      // Проверяем по хранилищу, а не по списку в памяти: в новой вкладке он ещё не загружен.
      // Запись могли удалить — тогда черновик снова можно сохранить без вопросов
      const object = objectId ? await getObject(objectId).catch(() => undefined) : undefined
      if (objectId && object?.deleted === 0 && draft.value?.draftId === draftId) {
        duplicateOf.value = objectId
      }
    },
    { immediate: true },
  )

  const showDuplicate = computed(
    () => vault.hasVault.value && !!duplicateOf.value && !saveAgain.value,
  )
  const headerTitle = computed(() => {
    if (!vault.hasVault.value) return t('capture.onboarding.title')
    return showDuplicate.value ? t('capture.duplicate.title') : t('capture.title')
  })
  const headerLead = computed(() => {
    if (!vault.hasVault.value) return t('capture.onboarding.lead')
    return showDuplicate.value ? '' : t('capture.lead')
  })

  const initial = computed<ImpactInput | null>(() =>
    draft.value ? draftToImpactInput(draft.value) : null,
  )

  const source = computed(() => {
    const info = draft.value?.source
    const meta = SOURCES[info?.type ?? 'web']
    const href = safeHref(info?.uri)
    return {
      icon: meta.icon,
      from: meta.label ? t('capture.from', { source: meta.label }) : t('capture.fromWeb'),
      href,
      host: href ? hostOf(href) : null,
      ref: info?.externalRef ?? null,
    }
  })

  const preview = computed(() => {
    const current = draft.value
    if (!current) return null
    return {
      title: current.title?.trim() || t('capture.untitled'),
      description: current.description?.trim().slice(0, 280) ?? '',
      evidence: current.evidence?.length ?? 0,
      metrics: current.metrics?.length ?? 0,
    }
  })

  function forget() {
    memoryDraft = null
    clearStashedDraft()
  }

  /* ---------- онбординг ---------- */

  const creating = ref(false)
  const createError = ref(false)

  async function startLocal() {
    creating.value = true
    createError.value = false
    try {
      await vault.create()
    } catch (error) {
      console.error('[capture] cannot create vault', error)
      createError.value = true
    } finally {
      creating.value = false
    }
  }

  const loginRoute = { name: 'login', query: { redirect: CAPTURE_PATH } } as const

  /* ---------- сохранение ---------- */

  async function save(input: ImpactInput) {
    const impact = await create(input)
    const draftId = draft.value?.draftId
    if (draftId) await rememberCapture(draftId, impact.objectId).catch(() => {})
    forget()
    await router.replace({ name: 'impact', params: { id: impact.objectId } })
  }

  function cancel() {
    forget()
    void router.replace({ name: 'dashboard' })
  }

  // Ушли со страницы с хранилищем — черновик больше не нужен (форма уже спросила подтверждение).
  // Без хранилища уход — это вход в аккаунт: черновик ждёт возвращения на /capture.
  onBeforeRouteLeave(() => {
    if (vault.hasVault.value) forget()
  })

  return {
    t,
    hasVault: vault.hasVault,
    vaultUnavailable: computed(() => vault.status.value === 'unavailable'),
    draft,
    invalid,
    initial,
    source,
    preview,
    creating,
    createError,
    startLocal,
    loginRoute,
    duplicateOf,
    saveAgain,
    allowSaveAgain,
    headerTitle,
    headerLead,
    save,
    cancel,
    clientLinks: CLIENT_LINKS,
  }
}
