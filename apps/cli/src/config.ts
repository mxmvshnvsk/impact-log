import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { DEFAULT_APP_URL, normalizeAppUrl } from './app-url'
import { CliError, inputError } from './errors'
import { t } from './i18n'

export interface CliConfig {
  appUrl?: string
}

/** $XDG_CONFIG_HOME/impact-log/config.json, ~/.config/…; на Windows — %APPDATA%\impact-log\config.json */
export function configPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const base =
    platform === 'win32'
      ? env.APPDATA || join(homedir(), 'AppData', 'Roaming')
      : env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(base, 'impact-log', 'config.json')
}

export async function readConfig(path = configPath()): Promise<CliConfig> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw new CliError(t('error.configRead', { path, message: (error as Error).message }))
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const { appUrl } = parsed as Record<string, unknown>
    return typeof appUrl === 'string' ? { appUrl } : {}
  } catch (error) {
    throw new CliError(t('error.configRead', { path, message: (error as Error).message }))
  }
}

export async function writeConfig(config: CliConfig, path = configPath()): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  } catch (error) {
    throw new CliError(t('error.configWrite', { path, message: (error as Error).message }))
  }
}

export function parseAppUrl(value: string): string {
  const url = normalizeAppUrl(value)
  if (!url) throw inputError(t('error.appUrl', { value }))
  return url
}

export type AppUrlSource = 'flag' | 'env' | 'config' | 'default'

/** Приоритет: флаг > IMPACT_LOG_URL > конфиг > https://impact-log.com */
export async function resolveAppUrl(
  flag?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ url: string; source: AppUrlSource }> {
  if (flag) return { url: parseAppUrl(flag), source: 'flag' }
  if (env.IMPACT_LOG_URL) return { url: parseAppUrl(env.IMPACT_LOG_URL), source: 'env' }
  const config = await readConfig()
  if (config.appUrl) return { url: parseAppUrl(config.appUrl), source: 'config' }
  return { url: DEFAULT_APP_URL, source: 'default' }
}
