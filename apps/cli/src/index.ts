import { runAdd } from './commands/add'
import { runConfig } from './commands/config'
import { runDecode } from './commands/decode'
import { runGit } from './commands/git'
import { CliError, EXIT, inputError } from './errors'
import { t } from './i18n'
import { printError } from './output'

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  add: runAdd,
  git: runGit,
  config: runConfig,
  decode: runDecode,
}

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv
  if (command === undefined || command === '-h' || command === '--help') {
    process.stdout.write(`${t('help.main')}\n`)
    return
  }
  if (command === '-v' || command === '--version') {
    process.stdout.write(`${__IMPACT_VERSION__}\n`)
    return
  }
  if (command === 'help') {
    const target = rest[0]
    if (target && target in COMMANDS) return COMMANDS[target]?.(['--help'])
    process.stdout.write(`${t('help.main')}\n`)
    return
  }
  const run = COMMANDS[command]
  if (!run) throw inputError(t('error.unknownCommand', { command }))
  await run(rest)
}

main(process.argv.slice(2)).then(
  () => {
    process.exitCode = EXIT.ok
  },
  (error: unknown) => {
    if (error instanceof CliError) {
      printError(error.message)
      process.exitCode = error.exitCode
    } else {
      printError(t('error.unexpected', { message: (error as Error)?.message ?? String(error) }))
      process.exitCode = EXIT.other
    }
  },
)
