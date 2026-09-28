import { IMPACT_SCORE_MAX, IMPACT_SCORE_MIN, normalizeLabels, TITLE_MAX } from '@impact-log/core'
import * as vscode from 'vscode'

/** Шаги захвата: заголовок → влияние → метки. Esc на любом шаге — отмена (undefined) */

const STEPS = 3

const stepTitle = (step: number) => vscode.l10n.t('impact log: capture ({0}/{1})', step, STEPS)

export const scoreLabel = (score: number) =>
  [
    vscode.l10n.t('Small win'),
    vscode.l10n.t('Helpful'),
    vscode.l10n.t('Noticeable result'),
    vscode.l10n.t('Major impact'),
    vscode.l10n.t('Key result of the year'),
  ][score - 1] ?? ''

export async function askTitle(value: string): Promise<string | undefined> {
  const title = await vscode.window.showInputBox({
    title: stepTitle(1),
    prompt: vscode.l10n.t('What did you do?'),
    placeHolder: vscode.l10n.t('e.g. Sped up the CI build'),
    value,
    valueSelection: [0, value.length],
    ignoreFocusOut: true,
    validateInput: (input) => {
      if (!input.trim()) return vscode.l10n.t('Enter a title')
      if (input.trim().length > TITLE_MAX) {
        return vscode.l10n.t('At most {0} characters', TITLE_MAX)
      }
      return null
    },
  })
  return title?.trim()
}

interface ScoreItem extends vscode.QuickPickItem {
  score: number
}

export function askScore(defaultScore: number): Promise<number | undefined> {
  const items: ScoreItem[] = []
  for (let score = IMPACT_SCORE_MIN; score <= IMPACT_SCORE_MAX; score++) {
    items.push({ score, label: String(score), description: scoreLabel(score) })
  }
  const pick = vscode.window.createQuickPick<ScoreItem>()
  pick.title = stepTitle(2)
  pick.placeholder = vscode.l10n.t('How big was the impact?')
  pick.items = items
  pick.ignoreFocusOut = true
  const active = items.find((item) => item.score === defaultScore)
  if (active) pick.activeItems = [active]
  return new Promise((resolve) => {
    let result: number | undefined
    pick.onDidAccept(() => {
      result = (pick.selectedItems[0] ?? pick.activeItems[0])?.score
      pick.hide()
    })
    pick.onDidHide(() => {
      pick.dispose()
      resolve(result)
    })
    pick.show()
  })
}

export async function askLabels(): Promise<string[] | undefined> {
  const value = await vscode.window.showInputBox({
    title: stepTitle(3),
    prompt: vscode.l10n.t('Labels, comma separated (optional). Enter to skip.'),
    placeHolder: 'ci, performance',
    ignoreFocusOut: true,
  })
  return value === undefined ? undefined : normalizeLabels(value.split(','))
}
