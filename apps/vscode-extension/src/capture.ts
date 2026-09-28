import { basename } from 'node:path'
import {
  DESCRIPTION_MAX,
  type Evidence,
  IMPACT_SCORE_MAX,
  IMPACT_SCORE_MIN,
  type ImpactDraft,
  TITLE_MAX,
  todayIso,
} from '@impact-log/core'
import * as vscode from 'vscode'
import { DEFAULT_APP_URL, normalizeAppUrl } from './app-url'
import { captureUrl, type DraftFields, DraftTooLargeError, makeDraft, truncate } from './draft'
import { type FileInfo, readCommit, readFile, readRepo } from './git'
import { branchUrl, commitUrl, fileUrl } from './git-remote'
import { askLabels, askScore, askTitle } from './ui'

/** Выделение → цитата: до 2000 символов (дальше ужимаем, если не помещается в ссылку) */
const EXCERPT_STEPS = [2000, 1000, 500, 0]
const DESCRIPTION_STEPS = [DESCRIPTION_MAX, 6000, 3000, 1000]

/** Ошибка для пользователя; settings — предложить открыть настройку impactLog.appUrl */
export class CaptureError extends Error {
  constructor(
    message: string,
    readonly settings = false,
  ) {
    super(message)
    this.name = 'CaptureError'
  }
}

/* ---------- настройки ---------- */

interface Settings {
  appUrl: string
  defaultScore: number
}

function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration('impactLog')
  const raw = config.get<string>('appUrl') || DEFAULT_APP_URL
  const appUrl = normalizeAppUrl(raw)
  if (!appUrl) {
    throw new CaptureError(
      vscode.l10n.t(
        'Invalid address "{0}": use https://… (http:// only for localhost), without query, # or special characters.',
        raw,
      ),
      true,
    )
  }
  const score = config.get<number>('defaultScore') ?? 3
  const defaultScore =
    Number.isInteger(score) && score >= IMPACT_SCORE_MIN && score <= IMPACT_SCORE_MAX ? score : 3
  return { appUrl, defaultScore }
}

/* ---------- git (только в доверенной рабочей области) ---------- */

const gitAllowed = () => vscode.workspace.isTrusted

function branchEvidence(info: {
  repo: FileInfo['repo']
  branch?: FileInfo['branch']
}): Evidence | undefined {
  if (!info.branch) return undefined
  const { name, remoteName } = info.branch
  return {
    kind: 'branch',
    ref: truncate(name, 200),
    ...(info.repo && remoteName ? { url: branchUrl(info.repo, remoteName) } : {}),
  }
}

/** Путь для подписи без абсолютных путей: от корня репозитория или рабочей области, иначе имя файла */
function displayPath(uri: vscode.Uri, git: FileInfo | null): string {
  if (git?.path) return git.path
  const relative = vscode.workspace.asRelativePath(uri, false)
  return relative === uri.fsPath ? basename(uri.fsPath) : relative.replace(/\\/g, '/')
}

/** Убирает общий отступ выделенного кода */
function dedent(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^\s*/)?.[0].length ?? 0)
  const common = indents.length ? Math.min(...indents) : 0
  return lines
    .map((line) => line.slice(common))
    .join('\n')
    .trim()
}

/* ---------- сборка и открытие ---------- */

interface Shrinkable {
  fields: DraftFields
  /** Индекс артефакта с цитатой, которую можно ужимать */
  excerptIndex?: number
}

/** Черновик → ссылка; если не помещается — ужимаем цитату, затем описание */
function fitToLink(appUrl: string, { fields, excerptIndex }: Shrinkable) {
  const original = excerptIndex !== undefined ? fields.evidence?.[excerptIndex]?.excerpt : undefined
  for (const excerptMax of original ? EXCERPT_STEPS : [0]) {
    for (const descriptionMax of fields.description ? DESCRIPTION_STEPS : [0]) {
      const evidence = fields.evidence?.map((item, index) => {
        if (index !== excerptIndex || !original) return item
        const { excerpt: _excerpt, ...rest } = item
        return excerptMax ? { ...rest, excerpt: truncate(original, excerptMax) } : rest
      })
      const description = fields.description
        ? truncate(fields.description, descriptionMax)
        : undefined
      try {
        const draft = makeDraft({ ...fields, evidence, description })
        const shortened =
          (original !== undefined && original.length > excerptMax) ||
          (fields.description?.length ?? 0) > descriptionMax
        return { url: captureUrl(appUrl, draft), draft, shortened }
      } catch (error) {
        if (!(error instanceof DraftTooLargeError)) throw error
      }
    }
  }
  throw new CaptureError(
    vscode.l10n.t('The draft is too large to fit into a link. Select less code and try again.'),
  )
}

async function openCapture(url: string, shortened: boolean): Promise<void> {
  const target = new URL(url)
  // Uri.from — без повторного экранирования: фрагмент draft=… (base64url) уходит как есть
  const uri = vscode.Uri.from({
    scheme: target.protocol.replace(/:$/, ''),
    authority: target.host,
    path: target.pathname,
    fragment: target.hash.replace(/^#/, ''),
  })
  const opened = await vscode.env.openExternal(uri)
  if (!opened) {
    const copy = vscode.l10n.t('Copy link')
    const choice = await vscode.window.showWarningMessage(
      vscode.l10n.t("Couldn't open the browser. Copy the capture link instead?"),
      copy,
    )
    if (choice === copy) await vscode.env.clipboard.writeText(url)
    return
  }
  if (shortened) {
    void vscode.window.showInformationMessage(
      vscode.l10n.t(
        'The draft was shortened to fit into the link: check the quote or description.',
      ),
    )
  }
  vscode.window.setStatusBarMessage(
    vscode.l10n.t('impact log: draft opened in the browser — review and save it there'),
    5000,
  )
}

async function finish(
  settings: Settings,
  draft: { title: string } & Omit<DraftFields, 'title' | 'impactScore' | 'labels'>,
  excerptIndex?: number,
): Promise<void> {
  const impactScore = await askScore(settings.defaultScore)
  if (impactScore === undefined) return
  const labels = await askLabels()
  if (labels === undefined) return
  const { url, shortened } = fitToLink(settings.appUrl, {
    fields: { ...draft, impactScore, labels },
    excerptIndex,
  })
  await openCapture(url, shortened)
}

/* ---------- команды ---------- */

const firstLine = (text: string) =>
  truncate(
    text
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ?? '',
    120,
  )

/** impactLog.capture / impactLog.captureSelection: активный редактор, выделение → цитата + permalink */
export async function captureEditor(options: { requireSelection: boolean }): Promise<void> {
  const settings = readSettings()
  const editor = vscode.window.activeTextEditor
  const selection = editor && !editor.selection.isEmpty ? editor.selection : undefined
  if (options.requireSelection && (!editor || !selection)) {
    void vscode.window.showInformationMessage(vscode.l10n.t('Select some code first.'))
    return
  }

  const evidence: Evidence[] = []
  let excerptIndex: number | undefined
  let source: NonNullable<ImpactDraft['source']> = { type: 'vscode' }
  let prefill = ''

  if (editor && selection) {
    const { document } = editor
    const text = dedent(document.getText(selection))
    prefill = firstLine(text)
    // Выделение до начала следующей строки не захватывает её
    const endLine =
      selection.end.character === 0 && selection.end.line > selection.start.line
        ? selection.end.line
        : selection.end.line + 1
    const lines = { start: selection.start.line + 1, end: endLine }
    const git =
      document.uri.scheme === 'file' && gitAllowed() ? await readFile(document.uri.fsPath) : null
    const path = displayPath(document.uri, git)
    const range = lines.start === lines.end ? `${lines.start}` : `${lines.start}-${lines.end}`
    const permalink =
      git?.repo && git.head && git.path
        ? fileUrl(git.repo, git.head, git.path, document.isDirty || git.changed ? undefined : lines)
        : undefined
    excerptIndex = evidence.length
    evidence.push({
      kind: permalink ? 'url' : 'text',
      title: truncate(`${path}:${range}`, 300),
      ...(permalink ? { url: permalink } : {}),
      ...(git?.head ? { ref: git.head.slice(0, 12) } : {}),
      excerpt: text,
    })
    const branch = git ? branchEvidence(git) : undefined
    if (branch) evidence.push(branch)
    source = {
      type: 'vscode',
      ...(permalink && permalink.length <= 2000 ? { uri: permalink } : {}),
      ...(git?.head ? { externalRef: git.repo ? `${git.repo.slug}@${git.head}` : git.head } : {}),
    }
  } else if (gitAllowed()) {
    const cwd = await repoFolder(editor)
    const repo = cwd ? await readRepo(cwd) : null
    const branch = repo ? branchEvidence(repo) : undefined
    if (branch) evidence.push(branch)
  }

  const title = await askTitle(prefill)
  if (!title) return
  await finish(
    settings,
    {
      title: truncate(title, TITLE_MAX),
      occurredAt: todayIso(),
      evidence,
      source,
    },
    excerptIndex,
  )
}

/** Папка для git: каталог активного файла, иначе единственная папка рабочей области (или выбор) */
async function repoFolder(editor?: vscode.TextEditor): Promise<string | undefined> {
  const uri = editor?.document.uri
  if (uri?.scheme === 'file') return vscode.Uri.joinPath(uri, '..').fsPath
  const folders = (vscode.workspace.workspaceFolders ?? []).filter(
    (folder) => folder.uri.scheme === 'file',
  )
  if (folders.length <= 1) return folders[0]?.uri.fsPath
  const picked = await vscode.window.showWorkspaceFolderPick({
    placeHolder: vscode.l10n.t('Which repository?'),
    ignoreFocusOut: true,
  })
  return picked?.uri.fsPath
}

/** impactLog.captureCommit: последний коммит (HEAD) репозитория активного файла или рабочей области */
export async function captureCommit(): Promise<void> {
  const settings = readSettings()
  if (!gitAllowed()) {
    throw new CaptureError(
      vscode.l10n.t('Git is disabled in Restricted Mode. Trust this workspace to capture commits.'),
    )
  }
  const cwd = await repoFolder(vscode.window.activeTextEditor)
  if (!cwd) throw new CaptureError(vscode.l10n.t('Open a folder with a git repository first.'))
  const repo = await readRepo(cwd)
  if (!repo) throw new CaptureError(vscode.l10n.t('No git repository found here.'))
  const commit = repo.head ? await readCommit(cwd, repo.head) : null
  if (!commit) throw new CaptureError(vscode.l10n.t('The repository has no commits yet.'))

  const url = repo.repo ? commitUrl(repo.repo, commit.sha) : undefined
  const evidence: Evidence[] = [
    {
      kind: 'commit',
      ref: commit.sha.slice(0, 12),
      ...(commit.subject ? { title: truncate(commit.subject, 300) } : {}),
      ...(url ? { url } : {}),
    },
  ]
  const branch = branchEvidence(repo)
  if (branch) evidence.push(branch)

  const title = await askTitle(truncate(commit.subject, TITLE_MAX))
  if (!title) return
  await finish(settings, {
    title,
    ...(commit.body ? { description: commit.body } : {}),
    occurredAt: commit.date || todayIso(),
    evidence,
    source: {
      type: 'vscode',
      externalRef: repo.repo ? `${repo.repo.slug}@${commit.sha}` : commit.sha,
      ...(url ? { uri: url } : {}),
    },
  })
}
