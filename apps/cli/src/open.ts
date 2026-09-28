import { spawn } from 'node:child_process'

/** Команда открытия ссылки в браузере по умолчанию — без shell, URL отдельным аргументом */
export function openCommand(
  url: string,
  platform: NodeJS.Platform = process.platform,
): [command: string, args: string[]] {
  if (platform === 'darwin') return ['open', [url]]
  // Не `cmd /c start`: cmd разбирает строку сам, и `&`, `|`, `^`… в URL стали бы командами.
  // rundll32 передаёт хвост командной строки обработчику протокола как есть — без интерпретатора.
  if (platform === 'win32') return ['rundll32', ['url.dll,FileProtocolHandler', url]]
  return ['xdg-open', [url]]
}

const SETTLE_MS = 2000

/**
 * Запускает открыватель и ждёт его завершения до 2 с: ненулевой код — ошибка
 * (например, xdg-open без браузера). Если процесс ещё работает — считаем, что браузер открывается.
 */
export function openInBrowser(url: string, platform: NodeJS.Platform = process.platform) {
  const [command, args] = openCommand(url, platform)
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      detached: platform !== 'win32',
      windowsHide: true,
    })
    const timer = setTimeout(() => {
      child.unref()
      resolve()
    }, SETTLE_MS)
    timer.unref()
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (code === 0 || code === null) resolve()
      else reject(new Error(`${command} exited with code ${code}`))
    })
  })
}
