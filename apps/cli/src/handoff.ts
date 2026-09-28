import type { ImpactDraft } from '@impact-log/core'
import { captureUrl } from './draft'
import { t } from './i18n'
import { openInBrowser } from './open'
import { warn } from './output'

export interface HandoffOptions {
  appUrl: string
  print?: boolean
  json?: boolean
  noOpen?: boolean
}

/**
 * Последний шаг любой команды: вывести черновик/ссылку или открыть браузер.
 * Ссылка всегда проверяется на размер, даже для --json (чтобы не было сюрпризов потом).
 */
export async function handOff(draft: ImpactDraft, options: HandoffOptions): Promise<void> {
  const url = captureUrl(options.appUrl, draft)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(draft, null, 2)}\n`)
    return
  }
  if (options.print) {
    process.stdout.write(`${url}\n`)
    return
  }
  if (options.noOpen) {
    process.stderr.write(`${t('handoff.openManually')}\n`)
    process.stdout.write(`${url}\n`)
    return
  }
  try {
    await openInBrowser(url)
    process.stderr.write(`${t('handoff.opened')}\n`)
  } catch (error) {
    warn(t('handoff.openFailed', { message: (error as Error).message }))
    process.stdout.write(`${url}\n`)
  }
}
