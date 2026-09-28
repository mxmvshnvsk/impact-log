import type { Impact } from '@impact-log/core'
import { readonly, shallowRef } from 'vue'
import { useImpacts } from './useImpacts'

/*
 * «Отменить удаление»: последняя удалённая запись держится в памяти этой вкладки, пока пользователь
 * не вернёт её или не закроет сообщение. Восстановление — через importMany (тот же objectId,
 * для синхронизации это обычное изменение). Синглтон модуля.
 */
const lastDeleted = shallowRef<Impact | null>(null)

export function useDeletedImpact() {
  const { remove, importMany } = useImpacts()

  async function removeWithUndo(impact: Impact): Promise<void> {
    await remove(impact.objectId)
    lastDeleted.value = impact
  }

  async function restore(): Promise<Impact | null> {
    const impact = lastDeleted.value
    if (!impact) return null
    await importMany([{ ...impact, updatedAt: new Date().toISOString() }])
    lastDeleted.value = null
    return impact
  }

  function dismiss() {
    lastDeleted.value = null
  }

  return { lastDeleted: readonly(lastDeleted), removeWithUndo, restore, dismiss }
}
