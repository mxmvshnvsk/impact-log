import { t } from './i18n'

export function warn(message: string): void {
  process.stderr.write(`impact: ${t('warning.prefix')}: ${message}\n`)
}

export function printError(message: string): void {
  process.stderr.write(`impact: ${t('error.prefix')}: ${message}\n`)
}
