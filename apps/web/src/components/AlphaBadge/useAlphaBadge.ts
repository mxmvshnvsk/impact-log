import { useI18n } from 'vue-i18n'
import { ISSUES_URL } from '@/constants/links'

/** Пометка «альфа» в шапке: ведёт к новому issue на GitHub — туда тестировщики пишут о проблемах */
export function useAlphaBadge() {
  const { t } = useI18n()
  return { t, issuesUrl: ISSUES_URL }
}
