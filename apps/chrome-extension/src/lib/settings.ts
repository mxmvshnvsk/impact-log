import { IMPACT_SCORE_MAX, IMPACT_SCORE_MIN } from '@impact-log/core'
import { DEFAULT_APP_URL, normalizeAppUrl } from './app-url'

/** Настройки — chrome.storage.sync (синхронизируются между браузерами пользователя) */
export interface Settings {
  appUrl: string
  defaultScore: number
}

export const DEFAULT_SETTINGS: Settings = { appUrl: DEFAULT_APP_URL, defaultScore: 3 }

export const isScore = (value: unknown): value is number =>
  Number.isInteger(value) &&
  (value as number) >= IMPACT_SCORE_MIN &&
  (value as number) <= IMPACT_SCORE_MAX

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(['appUrl', 'defaultScore'])
  const appUrl = typeof stored.appUrl === 'string' ? normalizeAppUrl(stored.appUrl) : null
  return {
    appUrl: appUrl ?? DEFAULT_SETTINGS.appUrl,
    defaultScore: isScore(stored.defaultScore)
      ? stored.defaultScore
      : DEFAULT_SETTINGS.defaultScore,
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ appUrl: settings.appUrl, defaultScore: settings.defaultScore })
}
