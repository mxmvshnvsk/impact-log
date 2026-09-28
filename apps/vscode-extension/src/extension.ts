import * as vscode from 'vscode'
import { CaptureError, captureCommit, captureEditor } from './capture'

/**
 * impact log для VS Code: команды захвата собирают черновик (Capture Protocol) и открывают
 * ${appUrl}/capture#draft=… в браузере. Никаких сетевых запросов и хранения данных.
 */
export const COMMANDS = {
  capture: 'impactLog.capture',
  captureSelection: 'impactLog.captureSelection',
  captureCommit: 'impactLog.captureCommit',
} as const

async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!(error instanceof CaptureError)) console.error('impact log:', error)
    const openSettings = vscode.l10n.t('Open Settings')
    const actions = error instanceof CaptureError && error.settings ? [openSettings] : []
    const choice = await vscode.window.showErrorMessage(
      vscode.l10n.t('impact log: {0}', message),
      ...actions,
    )
    if (choice === openSettings) {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'impactLog.appUrl')
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.capture, () =>
      run(() => captureEditor({ requireSelection: false })),
    ),
    vscode.commands.registerCommand(COMMANDS.captureSelection, () =>
      run(() => captureEditor({ requireSelection: true })),
    ),
    vscode.commands.registerCommand(COMMANDS.captureCommit, () => run(captureCommit)),
  )
}

export function deactivate(): void {}
