import { decodeDraft, readDraftFromHash } from '@impact-log/core'
import { inputError } from '../errors'
import { t } from '../i18n'
import { readStdin } from '../prompt'

/**
 * impact decode <ссылка|#draft=…|-> — показать, что лежит в ссылке захвата (без сети).
 * Удобно проверить ссылку перед открытием и отладить handoff.
 */
export async function runDecode(args: string[]): Promise<void> {
  const [input, ...extra] = args
  if (input === '-h' || input === '--help') {
    process.stdout.write(`${t('help.decode')}\n`)
    return
  }
  if (input === undefined || extra.length) throw inputError(t('error.decodeUsage'))
  const text = (input === '-' ? await readStdin() : input).trim()
  const hash = text.includes('#') ? text.slice(text.indexOf('#')) : null
  let draft = hash ? readDraftFromHash(hash) : null
  if (!hash) {
    try {
      draft = decodeDraft(text.replace(/^draft=/, ''))
    } catch {
      draft = null
    }
  }
  if (!draft) throw inputError(t('error.decode'))
  process.stdout.write(`${JSON.stringify(draft, null, 2)}\n`)
}
