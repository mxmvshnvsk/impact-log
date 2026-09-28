import { type ImpactInput, todayIso, toImpactInput } from '@impact-log/core'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useDeletedImpact } from '@/composables/useDeletedImpact'
import { useImpacts } from '@/composables/useImpacts'
import { historyBack } from '@/utils/navigation'

/** /impacts/new (в т.ч. ?title=&score= из быстрого ввода, ?duplicate=<id>) и /impacts/:id/edit */
export function useImpactEditView() {
  const { t } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const { get, ready, whenReady, create, update } = useImpacts()
  const { removeWithUndo } = useDeletedImpact()

  const formRef = ref<{ release: () => void } | null>(null)
  const initial = shallowRef<Partial<ImpactInput> | null>(null)
  const formKey = ref('')
  const deleteOpen = ref(false)
  const deleting = ref(false)

  const id = computed(() => (route.name === 'impact-edit' ? String(route.params.id) : null))
  const editing = computed(() => id.value !== null)
  const impact = computed(() => (id.value ? get(id.value) : undefined))
  const duplicateOf = computed(() =>
    typeof route.query.duplicate === 'string' ? route.query.duplicate : null,
  )

  const heading = computed(() => {
    if (editing.value) return t('impacts.edit.editTitle')
    return duplicateOf.value ? t('impacts.edit.duplicateTitle') : t('impacts.edit.newTitle')
  })

  function initialFromRoute(): Partial<ImpactInput> | null {
    if (id.value) {
      const current = get(id.value)
      return current ? toImpactInput(current) : null
    }
    if (duplicateOf.value) {
      const source = get(duplicateOf.value)
      if (source) return { ...toImpactInput(source), occurredAt: todayIso() }
    }
    const title = typeof route.query.title === 'string' ? route.query.title : ''
    const score = Number(route.query.score)
    return {
      ...(title ? { title } : {}),
      ...(Number.isInteger(score) && score >= 1 && score <= 5 ? { impactScore: score } : {}),
    }
  }

  // Форма создаётся один раз на маршрут: изменения записи из другой вкладки не сбрасывают ввод
  watch(
    () => route.fullPath,
    async (path) => {
      if (route.name !== 'impact-new' && route.name !== 'impact-edit') return
      initial.value = null
      await whenReady()
      initial.value = initialFromRoute()
      formKey.value = path
    },
    { immediate: true },
  )

  const viewRoute = computed(() => ({ name: 'impact', params: { id: id.value ?? '' } }) as const)

  async function save(input: ImpactInput) {
    if (id.value) {
      await update(id.value, input)
      const target = router.resolve(viewRoute.value).fullPath
      if (historyBack() === target) router.back()
      else await router.replace(viewRoute.value)
      return
    }
    const created = await create(input)
    await router.replace({ name: 'impact', params: { id: created.objectId } })
  }

  function cancel() {
    if (historyBack()) router.back()
    else void router.push(editing.value ? viewRoute.value : { name: 'dashboard' })
  }

  async function confirmDelete() {
    const current = impact.value
    if (!current) return
    deleting.value = true
    try {
      formRef.value?.release()
      await removeWithUndo(current)
      deleteOpen.value = false
      await router.replace({ name: 'dashboard' })
    } finally {
      deleting.value = false
    }
  }

  return {
    t,
    ready,
    editing,
    impact,
    initial,
    formKey,
    formRef,
    heading,
    viewRoute,
    deleteOpen,
    deleting,
    save,
    cancel,
    confirmDelete,
  }
}
