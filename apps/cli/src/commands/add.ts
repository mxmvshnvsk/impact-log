import { DESCRIPTION_MAX, TITLE_MAX, todayIso } from '@impact-log/core'
import { makeDraft } from '../draft'
import { inputError } from '../errors'
import { handOff } from '../handoff'
import { t } from '../i18n'
import { askTitleAndScore, isInteractive, readStdin } from '../prompt'
import { draftFieldsFromFlags, draftOptions, handoffFromFlags, parseCommandArgs } from './common'

const options = {
  ...draftOptions,
  description: { type: 'string', short: 'd' },
  stdin: { type: 'boolean' },
} as const

const DEFAULT_SCORE = 3

export async function runAdd(args: string[]): Promise<void> {
  const { values, positionals } = parseCommandArgs('add', args, options, true)
  if (values.help) {
    process.stdout.write(`${t('help.add')}\n`)
    return
  }
  if (values.description !== undefined && values.stdin)
    throw inputError(t('error.descriptionConflict'))

  const fields = draftFieldsFromFlags(values)
  const handoff = await handoffFromFlags(values)
  let title = positionals.join(' ').trim()

  const description = (values.stdin ? await readStdin() : (values.description ?? '')).trim()

  if (!title && !values.stdin && isInteractive()) {
    const answers = await askTitleAndScore({
      askScore: fields.impactScore === undefined,
      defaultScore: DEFAULT_SCORE,
    })
    title = answers.title
    if (answers.score !== undefined) fields.impactScore = answers.score
  }

  if (title.length > TITLE_MAX) {
    throw inputError(t('error.titleTooLong', { length: title.length, max: TITLE_MAX }))
  }
  if (description.length > DESCRIPTION_MAX) {
    throw inputError(
      t('error.descriptionTooLong', { length: description.length, max: DESCRIPTION_MAX }),
    )
  }
  if (!title && !description && !fields.evidence?.length && !fields.metrics?.length) {
    throw inputError(t('error.empty'))
  }

  const draft = makeDraft({
    ...fields,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    occurredAt: fields.occurredAt ?? todayIso(),
    source: { type: 'cli' },
  })
  await handOff(draft, handoff)
}
