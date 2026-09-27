import {
  EyeOff,
  KeyRound,
  Lock,
  MapPin,
  ServerCog,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

/*
 * Структура страницы принципов. Тексты — в i18n (principles.*).
 * Любое изменение в том, что и как мы храним, должно отражаться здесь (см. CLAUDE.md).
 */
const VALUES = [
  { key: 'minimal', icon: UserRound },
  { key: 'yours', icon: KeyRound },
  { key: 'secure', icon: ShieldCheck },
  { key: 'noTracking', icon: EyeOff },
  { key: 'honest', icon: Sparkles },
] as const

const STORED = [
  'login',
  'password',
  'totp',
  'recovery',
  'sessions',
  'trustedDevices',
  'entries',
  'logs',
  'locale',
] as const

const NOT_COLLECTED = ['email', 'phone', 'name', 'analytics', 'thirdParty', 'ads', 'sale'] as const

const INFRA = [
  { key: 'location', icon: MapPin },
  { key: 'transport', icon: Lock },
  { key: 'alpha', icon: ServerCog },
] as const

const CONTROL = [
  { key: 'export', soon: true },
  { key: 'delete', soon: true },
  { key: 'sessions', soon: true },
  { key: 'ai', soon: false },
] as const

export function usePrinciplesView() {
  const { t } = useI18n()
  return {
    t,
    values: VALUES,
    stored: STORED,
    notCollected: NOT_COLLECTED,
    infra: INFRA,
    control: CONTROL,
  }
}
