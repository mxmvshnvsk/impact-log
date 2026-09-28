/** Коды выхода: 0 — успех, 1 — ошибка ввода, 2 — всё остальное */
export const EXIT = { ok: 0, input: 1, other: 2 } as const
export type ExitCode = (typeof EXIT)[keyof typeof EXIT]

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: ExitCode = EXIT.other,
  ) {
    super(message)
    this.name = 'CliError'
  }
}

export const inputError = (message: string) => new CliError(message, EXIT.input)
