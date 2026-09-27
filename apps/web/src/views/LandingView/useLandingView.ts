import { ChartColumnBig, FileDown, NotebookPen, Search, ShieldCheck, Tags } from 'lucide-vue-next'
import { computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useMascot } from '@/composables/useMascot'

const PAINS = ['memory', 'small', 'impact'] as const
const STEPS = ['write', 'organize', 'summary'] as const
const FEATURES = [
  { key: 'entries', icon: NotebookPen, soon: false },
  { key: 'tags', icon: Tags, soon: false },
  { key: 'search', icon: Search, soon: false },
  { key: 'summaries', icon: ChartColumnBig, soon: true },
  { key: 'export', icon: FileDown, soon: true },
  { key: 'privacy', icon: ShieldCheck, soon: false },
] as const
const PRIVACY = ['noEmail', 'twoFactor', 'noTracking', 'yours'] as const

export function useLandingView() {
  const { t } = useI18n()
  // На узком экране облачко с репликой не помещается рядом с маскотом
  const { isMobile } = useBreakpoint()
  // На посадочной маскот просто живёт: моргает, оглядывается, иногда засыпает
  const mascot = reactive(useMascot())

  /** Примеры записей для первого экрана */
  const examples = computed(() =>
    (['first', 'second'] as const).map((key) => ({
      date: t(`landing.examples.${key}.date`),
      project: t(`landing.examples.${key}.project`),
      title: t(`landing.examples.${key}.title`),
      impact: t(`landing.examples.${key}.impact`),
      tags: t(`landing.examples.${key}.tags`).split(' '),
    })),
  )

  return {
    t,
    isMobile,
    mascot,
    examples,
    pains: PAINS,
    steps: STEPS,
    features: FEATURES,
    privacy: PRIVACY,
  }
}
