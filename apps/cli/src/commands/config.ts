import { configPath, parseAppUrl, readConfig, resolveAppUrl, writeConfig } from '../config'
import { inputError } from '../errors'
import { t } from '../i18n'

const KEY = 'app-url'

function assertKey(key: string | undefined): void {
  if (key !== KEY) throw inputError(t('error.configKey', { key: key ?? '' }))
}

export async function runConfig(args: string[]): Promise<void> {
  const [action, key, value, ...extra] = args
  const path = configPath()
  if (action === undefined || action === '-h' || action === '--help' || action === 'help') {
    process.stdout.write(`${t('help.config')}\n`)
    return
  }
  if (extra.length) throw inputError(t('error.configUsage'))
  switch (action) {
    case 'path':
      process.stdout.write(`${path}\n`)
      return
    case 'get': {
      if (key !== undefined) assertKey(key)
      if (value !== undefined) throw inputError(t('error.configUsage'))
      const { url, source } = await resolveAppUrl()
      if (key) {
        process.stdout.write(`${url}\n`)
      } else {
        const from = t(`config.source.${source}`, { path })
        process.stdout.write(`${KEY} = ${url} (${from})\n`)
      }
      return
    }
    case 'set': {
      assertKey(key)
      if (value === undefined) throw inputError(t('error.configUsage'))
      const appUrl = parseAppUrl(value)
      await writeConfig({ ...(await readConfig(path)), appUrl }, path)
      process.stderr.write(`${t('config.saved', { key: KEY, value: appUrl, path })}\n`)
      return
    }
    case 'unset': {
      assertKey(key)
      if (value !== undefined) throw inputError(t('error.configUsage'))
      const { appUrl: _removed, ...rest } = await readConfig(path)
      await writeConfig(rest, path)
      process.stderr.write(`${t('config.removed', { key: KEY, path })}\n`)
      return
    }
    default:
      throw inputError(t('error.configUsage'))
  }
}
