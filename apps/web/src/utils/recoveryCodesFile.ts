/** Текст файла с резервными кодами */
export function recoveryCodesText(login: string, codes: readonly string[], title: string): string {
  return [
    `${title} — impact log`,
    `login: ${login}`,
    `created: ${new Date().toISOString().slice(0, 10)}`,
    '',
    ...codes,
    '',
  ].join('\n')
}

export function downloadTextFile(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
