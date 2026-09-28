/** Текст файла Recovery Kit (строки уже переведены) */
export type RecoveryKitText = {
  title: string
  loginLabel: string
  createdLabel: string
  keyLabel: string
  instructions: string[]
}

export function recoveryKitText(
  strings: RecoveryKitText,
  login: string,
  createdAt: string,
  recoveryKey: string,
): string {
  const lines = [
    `impact log — ${strings.title}`,
    '='.repeat(40),
    '',
    `${strings.loginLabel}: ${login}`,
    `${strings.createdLabel}: ${createdAt}`,
    '',
    `${strings.keyLabel}:`,
    '',
    `    ${recoveryKey}`,
    '',
    ...strings.instructions.map((line) => `• ${line}`),
    '',
  ]
  return lines.join('\n')
}

/** Скачивание текстового файла, созданного в браузере (никуда не отправляется) */
export function downloadTextFile(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Сравнение «последних 4 символов» ключа: без дефисов/пробелов/регистра, O→0, I/L→1 */
export function matchesKeyTail(recoveryKey: string, input: string): boolean {
  const normalize = (value: string) =>
    value
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '')
      .replace(/O/g, '0')
      .replace(/[IL]/g, '1')
  const tail = normalize(recoveryKey).slice(-4)
  return tail.length === 4 && normalize(input) === tail
}
