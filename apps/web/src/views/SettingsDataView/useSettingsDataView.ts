import type { Impact } from '@impact-log/core'
import { computed } from 'vue'
import { useImpacts } from '@/composables/useImpacts'
import { useVault } from '@/composables/useVault'

export function useSettingsDataView() {
  const { impacts, count } = useImpacts()
  const { info } = useVault()
  return {
    impacts: computed(() => impacts.value as readonly Impact[]),
    count,
    createdAt: computed(() => info.value?.createdAt ?? null),
  }
}
