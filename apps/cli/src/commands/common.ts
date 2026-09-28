import { type ParseArgsOptionsConfig, parseArgs } from 'node:util'
import { resolveAppUrl } from '../config'
import type { DraftFields } from '../draft'
import { inputError } from '../errors'
import {
  parseCategories,
  parseDate,
  parseLabels,
  parseLink,
  parseMetric,
  parseScore,
} from '../fields'
import type { HandoffOptions } from '../handoff'
import { t } from '../i18n'

/** Опции, общие для add и git */
export const draftOptions = {
  score: { type: 'string', short: 's' },
  category: { type: 'string', short: 'c', multiple: true },
  label: { type: 'string', short: 'l', multiple: true },
  link: { type: 'string', multiple: true },
  metric: { type: 'string', short: 'm', multiple: true },
  date: { type: 'string' },
  print: { type: 'boolean' },
  json: { type: 'boolean' },
  'no-open': { type: 'boolean' },
  'app-url': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const satisfies ParseArgsOptionsConfig

export interface DraftFlagValues {
  score?: string
  category?: string[]
  label?: string[]
  link?: string[]
  metric?: string[]
  date?: string
  print?: boolean
  json?: boolean
  'no-open'?: boolean
  'app-url'?: string
}

/** Ошибки node:util parseArgs — на языке пользователя */
function describeArgsError(error: unknown): string {
  const { code, message } = error as { code?: string; message: string }
  const name = message.match(/'([^']+)'/)?.[1] ?? ''
  switch (code) {
    case 'ERR_PARSE_ARGS_UNKNOWN_OPTION':
      return t('error.unknownOption', { option: name })
    case 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE':
      return t('error.optionValue', { option: name })
    case 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL':
      return t('error.unexpectedArg', { arg: name })
    default:
      return message.replace(/\.$/, '')
  }
}

/** parseArgs с переводом ошибок разбора в ошибку ввода (код 1) */
export function parseCommandArgs<T extends ParseArgsOptionsConfig>(
  command: string,
  args: string[],
  options: T,
  allowPositionals: boolean,
) {
  try {
    return parseArgs({ args, options, allowPositionals, strict: true })
  } catch (error) {
    throw inputError(t('error.args', { message: describeArgsError(error), command }))
  }
}

export function draftFieldsFromFlags(values: DraftFlagValues): DraftFields {
  return {
    ...(values.score !== undefined ? { impactScore: parseScore(values.score) } : {}),
    ...(values.date !== undefined ? { occurredAt: parseDate(values.date) } : {}),
    categories: parseCategories(values.category),
    labels: parseLabels(values.label),
    metrics: (values.metric ?? []).map(parseMetric),
    evidence: (values.link ?? []).map(parseLink),
  }
}

export async function handoffFromFlags(values: DraftFlagValues): Promise<HandoffOptions> {
  const { url } = await resolveAppUrl(values['app-url'])
  return {
    appUrl: url,
    print: values.print,
    json: values.json,
    noOpen: values['no-open'],
  }
}
