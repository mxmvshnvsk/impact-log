import {
  Cpu,
  EyeOff,
  FileLock2,
  HardDrive,
  KeyRound,
  Lock,
  LockKeyhole,
  MapPin,
  ScrollText,
  ServerCog,
  Sparkles,
  UserRound,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { SOURCE_URL, sourceUrl } from '@/constants/links'

/*
 * Структура страницы принципов. Тексты — в i18n (principles.*).
 * Любое изменение в том, что и как мы храним, должно отражаться здесь (см. CLAUDE.md).
 * Источник истины — docs/api.md, packages/core/src/crypto, src/vault, src/account.
 */
const VALUES = [
  { key: 'localFirst', icon: HardDrive },
  { key: 'e2ee', icon: LockKeyhole },
  { key: 'minimal', icon: UserRound },
  { key: 'noTracking', icon: EyeOff },
  { key: 'yours', icon: KeyRound },
  { key: 'honest', icon: Sparkles },
] as const

/** Где проверить обещания этой страницы в коде */
const SOURCE_LINKS = [
  { key: 'repo', href: SOURCE_URL, path: null },
  {
    key: 'server',
    href: sourceUrl('apps/api/src/db/schema.ts'),
    path: 'apps/api/src/db/schema.ts',
  },
  {
    key: 'crypto',
    href: sourceUrl('packages/core/src/crypto', 'tree'),
    path: 'packages/core/src/crypto',
  },
  { key: 'vault', href: sourceUrl('apps/web/src/vault', 'tree'), path: 'apps/web/src/vault' },
  { key: 'adr', href: sourceUrl('docs/adr', 'tree'), path: 'docs/adr' },
  {
    key: 'deploy',
    href: sourceUrl('.github/workflows/deploy.yml'),
    path: '.github/workflows/deploy.yml',
  },
] as const

const DEVICE = [
  'records',
  'masterKey',
  'deviceKey',
  'account',
  'conflicts',
  'quarantine',
  'prefs',
  'draft',
  'swCache',
] as const

const CRYPTO = [
  { key: 'masterKey', icon: KeyRound },
  { key: 'objects', icon: FileLock2 },
  { key: 'password', icon: Cpu },
  { key: 'device', icon: HardDrive },
] as const

const SERVER = [
  'account',
  'password',
  'keys',
  'recovery',
  'totp',
  'records',
  'devices',
  'sessions',
] as const

const NEVER = [
  'password',
  'masterKey',
  'recoveryKey',
  'content',
  'categories',
  'labels',
  'metrics',
  'evidence',
  'deviceNames',
] as const

/** Честные ограничения: то, от чего модель не защищает (подробно — ADR-0006, «Модель угроз») */
const LIMITS = ['webCode', 'noRotation', 'recoveryKey', 'knownDevice', 'revoke'] as const

const COOKIES = ['session', 'device'] as const

const NOT_COLLECTED = [
  'email',
  'phone',
  'name',
  'analytics',
  'telemetry',
  'fingerprint',
  'thirdParty',
  'ads',
  'sale',
] as const

const INFRA = [
  { key: 'location', icon: MapPin },
  { key: 'transport', icon: Lock },
  { key: 'logs', icon: ScrollText },
  { key: 'alpha', icon: ServerCog },
] as const

const CONTROL = [
  { key: 'export', soon: false },
  { key: 'wipe', soon: false },
  { key: 'delete', soon: false },
  { key: 'devices', soon: false },
  { key: 'aiPrompt', soon: false },
  { key: 'ai', soon: false },
] as const

export function usePrinciplesView() {
  const { t } = useI18n()
  return {
    t,
    values: VALUES,
    sourceLinks: SOURCE_LINKS,
    device: DEVICE,
    crypto: CRYPTO,
    server: SERVER,
    never: NEVER,
    limits: LIMITS,
    cookies: COOKIES,
    notCollected: NOT_COLLECTED,
    infra: INFRA,
    control: CONTROL,
  }
}
