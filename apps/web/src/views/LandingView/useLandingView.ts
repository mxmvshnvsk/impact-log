import {
  ChartColumnBig,
  Chrome,
  FileDown,
  NotebookPen,
  Search,
  ShieldCheck,
  SquareCode,
  Terminal,
  Zap,
} from 'lucide-vue-next'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useClipboard } from '@/composables/useClipboard'
import { useMascot } from '@/composables/useMascot'
import { useVault } from '@/composables/useVault'
import { CAPTURE_CLIENTS, CLI_INSTALL_COMMAND, SOURCE_URL } from '@/constants/links'

const PAINS = ['memory', 'small', 'impact'] as const
const STEPS = ['write', 'organize', 'summary'] as const
const FEATURES = [
  { key: 'entries', icon: NotebookPen, soon: false },
  { key: 'capture', icon: Zap, soon: false },
  { key: 'search', icon: Search, soon: false },
  { key: 'summaries', icon: ChartColumnBig, soon: false },
  { key: 'export', icon: FileDown, soon: false },
  { key: 'privacy', icon: ShieldCheck, soon: false },
] as const
const PRIVACY = ['noAccount', 'e2ee', 'sync', 'noTracking', 'yours'] as const
const CLIENT_ICONS = { chrome: Chrome, vscode: SquareCode, cli: Terminal } as const
/** Секция «Быстрая запись»: иконка и, у CLI, команда установки с кнопкой копирования */
const CLIENTS = CAPTURE_CLIENTS.map((client) => ({
  ...client,
  icon: CLIENT_ICONS[client.key],
  command: client.key === 'cli' ? CLI_INSTALL_COMMAND : null,
}))

export function useLandingView() {
  const { t } = useI18n()
  const router = useRouter()
  const vault = useVault()
  // На узком экране облачко с репликой не помещается рядом с маскотом
  const { isMobile } = useBreakpoint()
  // На посадочной маскот просто живёт: моргает, оглядывается, иногда засыпает
  const mascot = reactive(useMascot())
  const clipboard = useClipboard()

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

  /* «Начать без синхронизации»: новое зашифрованное хранилище на этом устройстве → журнал */
  const starting = ref(false)
  const startError = ref(false)
  const unavailable = computed(() => vault.status.value === 'unavailable')

  async function start() {
    starting.value = true
    startError.value = false
    try {
      await vault.create()
      mascot.react('happy')
      await router.push({ name: 'dashboard' })
    } catch (error) {
      console.error('[landing] cannot create vault', error)
      startError.value = true
      mascot.react('oops')
    } finally {
      starting.value = false
    }
  }

  return {
    t,
    isMobile,
    mascot,
    examples,
    pains: PAINS,
    steps: STEPS,
    features: FEATURES,
    privacy: PRIVACY,
    sourceUrl: SOURCE_URL,
    clients: CLIENTS,
    copied: clipboard.copied,
    copy: clipboard.copy,
    starting,
    startError,
    unavailable,
    start,
  }
}
