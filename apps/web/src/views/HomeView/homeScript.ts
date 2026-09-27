import type { TerminalLine } from '@/utils/typewriter'

type Translate = (key: string) => string

/** Сценарий терминала на главной. Команды — не переводятся, вывод — через i18n */
export function buildHomeScript(t: Translate): TerminalLine[] {
  return [
    { kind: 'command', text: 'ssh guest@impact-log.com' },
    { kind: 'output', text: t('home.terminal.connected'), tone: 'muted' },
    { kind: 'command', text: 'impact log --since last-review' },
    { kind: 'output', text: t('home.terminal.collecting') },
    { kind: 'output', text: '[██████████░░░░░░] 64%', tone: 'accent' },
    { kind: 'command', text: 'impact status' },
    { kind: 'output', text: t('home.terminal.status'), tone: 'ok' },
  ]
}
