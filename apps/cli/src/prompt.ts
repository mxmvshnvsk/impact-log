import { createInterface } from 'node:readline/promises'
import { CliError, EXIT } from './errors'
import { parseScore } from './fields'
import { t } from './i18n'

export const isInteractive = () => Boolean(process.stdin.isTTY && process.stderr.isTTY)

const MAX_ATTEMPTS = 3

/** Интерактивно спрашивает заголовок и (если не задана) оценку. Вопросы — в stderr, stdout чистый */
export async function askTitleAndScore(options: {
  askScore: boolean
  defaultScore: number
}): Promise<{ title: string; score?: number }> {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true })
  const abort = new AbortController()
  rl.on('SIGINT', () => abort.abort())
  rl.on('close', () => abort.abort())
  const ask = async (question: string) => {
    try {
      return (await rl.question(question, { signal: abort.signal })).trim()
    } catch {
      throw new CliError(t('error.cancelled'), EXIT.input)
    }
  }
  try {
    const title = await ask(t('prompt.title'))
    if (!title) throw new CliError(t('error.titleRequired'), EXIT.input)
    if (!options.askScore) return { title }
    process.stderr.write(`${t('prompt.scoreLegend')}\n`)
    for (let attempt = 1; ; attempt++) {
      const answer = await ask(t('prompt.score', { default: options.defaultScore }))
      if (!answer) return { title, score: options.defaultScore }
      try {
        return { title, score: parseScore(answer) }
      } catch (error) {
        if (attempt >= MAX_ATTEMPTS) throw error
        process.stderr.write(`${t('prompt.scoreInvalid')}\n`)
      }
    }
  } finally {
    rl.removeAllListeners('close')
    rl.close()
  }
}

/** Весь stdin как текст (для --stdin) */
export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) process.stderr.write(`${t('prompt.stdinHint')}\n`)
  process.stdin.setEncoding('utf8')
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  return text
}
