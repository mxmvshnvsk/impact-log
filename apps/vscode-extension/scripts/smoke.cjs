/**
 * Смоук-проверка собранного dist/extension.cjs без VS Code: модуль `vscode` подменяется заглушкой.
 * Проверяет, что activate регистрирует 3 команды, и прогоняет сценарии захвата во временном git-репозитории
 * (remote на GitHub): выделение → permalink + цитата, последний коммит, Restricted Mode, неверный адрес.
 * Запуск: pnpm --filter impact-log-vscode build && pnpm --filter impact-log-vscode smoke
 * (IMPACT_SMOKE_PRINT=1 — вывести ссылки, например чтобы проверить их через `impact decode`).
 */
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')

/* ---------- заглушка vscode ---------- */

const state = {
  commands: new Map(),
  inputs: [],
  score: 3,
  opened: [],
  messages: [],
  settings: {},
  trusted: true,
  editor: undefined,
  folders: [],
}

const format = (message, args) => message.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)]))

class Uri {
  constructor({ scheme = 'file', authority = '', path: p = '', fragment = '', query = '' }) {
    Object.assign(this, { scheme, authority, path: p, fragment, query })
  }
  get fsPath() {
    return this.path
  }
  static file(fsPath) {
    return new Uri({ scheme: 'file', path: fsPath })
  }
  static from(components) {
    return new Uri(components)
  }
  static joinPath(uri, ...segments) {
    return Uri.file(path.join(uri.fsPath, ...segments))
  }
  // Как VS Code при openExternal: toString(true) + encodeURI
  toString(skipEncoding) {
    const raw = `${this.scheme}://${this.authority}${this.path}${this.query ? `?${this.query}` : ''}${this.fragment ? `#${this.fragment}` : ''}`
    return skipEncoding ? raw : encodeURI(raw)
  }
}

const message =
  (level) =>
  async (text, ...actions) => {
    state.messages.push({ level, text, actions })
    return undefined
  }

const vscode = {
  Uri,
  l10n: { t: (text, ...args) => format(text, args) },
  commands: {
    registerCommand(id, handler) {
      state.commands.set(id, handler)
      return { dispose() {} }
    },
    executeCommand: async () => undefined,
  },
  window: {
    get activeTextEditor() {
      return state.editor
    },
    showInputBox: async (options) => {
      const answer = state.inputs.shift()
      if (typeof answer === 'function') return answer(options)
      if (answer !== undefined && options.validateInput) {
        const problem = options.validateInput(answer)
        assert.equal(problem, null, `input "${answer}" rejected: ${problem}`)
      }
      return answer
    },
    createQuickPick() {
      const handlers = {}
      const pick = {
        items: [],
        activeItems: [],
        selectedItems: [],
        onDidAccept: (fn) => (handlers.accept = fn),
        onDidHide: (fn) => (handlers.hide = fn),
        show() {
          state.lastPick = { active: pick.activeItems[0]?.score, items: pick.items.length }
          if (state.score !== undefined) {
            pick.selectedItems = pick.items.filter((item) => item.score === state.score)
            handlers.accept?.()
          } else {
            pick.hide()
          }
        },
        hide: () => handlers.hide?.(),
        dispose() {},
      }
      return pick
    },
    showWorkspaceFolderPick: async () => state.folders[0],
    showInformationMessage: message('info'),
    showWarningMessage: message('warning'),
    showErrorMessage: message('error'),
    setStatusBarMessage: (text) => state.messages.push({ level: 'status', text }),
  },
  workspace: {
    get isTrusted() {
      return state.trusted
    },
    get workspaceFolders() {
      return state.folders
    },
    getConfiguration: () => ({ get: (key) => state.settings[key] }),
    asRelativePath: (uri) => {
      const folder = state.folders.find((f) => uri.fsPath.startsWith(f.uri.fsPath + path.sep))
      return folder ? path.relative(folder.uri.fsPath, uri.fsPath) : uri.fsPath
    },
  },
  env: {
    openExternal: async (uri) => {
      state.opened.push(uri.toString(true))
      return true
    },
    clipboard: { writeText: async () => undefined },
  },
}

const originalLoad = Module._load
Module._load = function load(request, ...rest) {
  return request === 'vscode' ? vscode : originalLoad.call(this, request, ...rest)
}

/* ---------- помощники ---------- */

function decode(url) {
  const match = url.match(/#draft=([A-Za-z0-9_-]+)$/)
  assert.ok(match, `no #draft= in ${url}`)
  const draft = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'))
  assert.equal(draft.schemaVersion, 1)
  assert.match(draft.draftId, /^[0-9a-f-]{36}$/)
  assert.equal(draft.source?.type, 'vscode')
  return draft
}

function editorFor(file, [startLine, endLine], { dirty = false } = {}) {
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split('\n')
  return {
    document: {
      uri: Uri.file(file),
      isDirty: dirty,
      getText: () => lines.slice(startLine, endLine + 1).join('\n'),
    },
    selection: {
      isEmpty: false,
      start: { line: startLine, character: 0 },
      end: { line: endLine, character: lines[endLine].length },
    },
  }
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' })

async function capture(command) {
  state.opened = []
  state.messages = []
  await state.commands.get(command)()
  return state.opened.map(decode)
}

/* ---------- сценарии ---------- */

async function main() {
  const extension = require(path.join(__dirname, '..', 'dist', 'extension.cjs'))
  const context = { subscriptions: [] }
  extension.activate(context)
  const ids = ['impactLog.capture', 'impactLog.captureSelection', 'impactLog.captureCommit']
  assert.deepEqual([...state.commands.keys()].sort(), [...ids].sort())
  assert.equal(context.subscriptions.length, 3)
  console.log('✓ activate registers', ids.join(', '))

  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'impact-log-smoke-')))
  const repo = path.join(root, 'repo')
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true })
  const file = path.join(repo, 'src', 'parser.ts')
  fs.writeFileSync(
    file,
    'export function parse(input: string) {\n  const tokens = tokenize(input)\n  return tokens.map((t) => t.value)\n}\n',
  )
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 'smoke@example.com')
  git(repo, 'config', 'user.name', 'Smoke')
  git(repo, 'remote', 'add', 'origin', 'git@github.com:org/repo.git')
  git(repo, 'checkout', '-q', '-b', 'feature/fast-parser')
  git(repo, 'add', '.')
  git(
    repo,
    'commit',
    '-q',
    '-m',
    'perf: faster parser',
    '-m',
    'Tokenizer is now linear.\n\nParse time 120 -> 35 ms.',
  )
  git(repo, 'update-ref', 'refs/remotes/origin/feature/fast-parser', 'HEAD')
  git(repo, 'config', 'branch.feature/fast-parser.remote', 'origin')
  git(repo, 'config', 'branch.feature/fast-parser.merge', 'refs/heads/feature/fast-parser')
  const sha = git(repo, 'rev-parse', 'HEAD').trim()
  state.folders = [{ uri: Uri.file(repo), name: 'repo', index: 0 }]
  const printUrl = () => process.env.IMPACT_SMOKE_PRINT && console.log(state.opened.at(-1))

  // 1. Выделение → permalink с диапазоном строк, цитата, ветка
  state.settings = { appUrl: 'http://localhost:5173/', defaultScore: 4 }
  state.editor = editorFor(file, [1, 2])
  state.inputs = [
    (options) => {
      assert.equal(options.value, 'const tokens = tokenize(input)')
      return 'Made the parser 3× faster'
    },
    'perf, Parser Speed',
  ]
  state.score = 5
  let [draft] = await capture('impactLog.captureSelection')
  printUrl()
  assert.ok(state.opened[0].startsWith('http://localhost:5173/capture#draft='))
  assert.equal(state.lastPick.active, 4, 'default score preselected')
  assert.equal(draft.title, 'Made the parser 3× faster')
  assert.equal(draft.impactScore, 5)
  assert.deepEqual(draft.labels, ['perf', 'parser-speed'])
  assert.equal(draft.evidence[0].url, `https://github.com/org/repo/blob/${sha}/src/parser.ts#L2-L3`)
  assert.equal(draft.evidence[0].title, 'src/parser.ts:2-3')
  assert.equal(
    draft.evidence[0].excerpt,
    'const tokens = tokenize(input)\nreturn tokens.map((t) => t.value)',
  )
  assert.deepEqual(draft.evidence[1], {
    kind: 'branch',
    ref: 'feature/fast-parser',
    url: 'https://github.com/org/repo/tree/feature/fast-parser',
  })
  assert.equal(draft.source.externalRef, `org/repo@${sha}`)
  console.log('✓ captureSelection: permalink', draft.evidence[0].url.replace(sha, '<sha>'))

  // 2. Файл изменён относительно HEAD → ссылка на файл без номеров строк
  fs.appendFileSync(file, '// wip\n')
  state.inputs = ['Parser tweak', '']
  state.score = 3
  ;[draft] = await capture('impactLog.captureSelection')
  assert.equal(draft.evidence[0].url, `https://github.com/org/repo/blob/${sha}/src/parser.ts`)
  assert.equal(draft.labels, undefined)
  git(repo, 'checkout', '-q', '--', 'src/parser.ts')
  console.log('✓ changed file: permalink without line anchor')

  // 3. Последний коммит
  state.inputs = [
    (options) => {
      assert.equal(options.value, 'perf: faster parser')
      return options.value
    },
    'perf',
  ]
  state.score = 4
  ;[draft] = await capture('impactLog.captureCommit')
  printUrl()
  assert.equal(draft.description, 'Tokenizer is now linear.\n\nParse time 120 -> 35 ms.')
  assert.deepEqual(draft.evidence[0], {
    kind: 'commit',
    ref: sha.slice(0, 12),
    title: 'perf: faster parser',
    url: `https://github.com/org/repo/commit/${sha}`,
  })
  assert.equal(draft.evidence[1].kind, 'branch')
  assert.equal(draft.source.uri, `https://github.com/org/repo/commit/${sha}`)
  console.log('✓ captureCommit: commit + branch, body → description')

  // 4. Restricted Mode: без git — цитата с относительным путём, коммит — ошибка
  state.trusted = false
  state.inputs = ['Untrusted capture', '']
  ;[draft] = await capture('impactLog.captureSelection')
  assert.deepEqual(Object.keys(draft.evidence[0]).sort(), ['excerpt', 'kind', 'title'])
  assert.equal(draft.evidence[0].kind, 'text')
  assert.equal(draft.evidence[0].title, 'src/parser.ts:2-3')
  assert.ok(!JSON.stringify(draft).includes(root), 'no absolute paths in the draft')
  const opened = await capture('impactLog.captureCommit')
  assert.equal(opened.length, 0)
  assert.equal(state.messages[0]?.level, 'error')
  state.trusted = true
  console.log('✓ Restricted Mode: no git, no absolute paths')

  // 5. Без выделения captureSelection не открывает браузер; capture — ветка как артефакт
  state.editor = { ...state.editor, selection: { ...state.editor.selection, isEmpty: true } }
  assert.equal((await capture('impactLog.captureSelection')).length, 0)
  state.inputs = ['Paired with the team on the release', '']
  ;[draft] = await capture('impactLog.capture')
  assert.deepEqual(draft.evidence, [
    {
      kind: 'branch',
      ref: 'feature/fast-parser',
      url: 'https://github.com/org/repo/tree/feature/fast-parser',
    },
  ])
  console.log('✓ capture without selection: branch evidence only')

  // 6. Огромное выделение ужимается до ссылки
  const big = path.join(repo, 'big.txt')
  fs.writeFileSync(big, `${'Очень длинная строка кода; '.repeat(40)}\n`.repeat(200))
  state.editor = editorFor(big, [0, 199])
  state.inputs = ['Big selection', '']
  ;[draft] = await capture('impactLog.captureSelection')
  assert.ok(state.opened[0].length <= 16000)
  assert.ok(draft.evidence[0].excerpt.length <= 2000)
  assert.ok(state.messages.some((m) => m.level === 'info'))
  console.log(
    '✓ large selection shortened to',
    draft.evidence[0].excerpt.length,
    'chars, link',
    state.opened[0].length,
  )

  // 7. Отмена на шаге оценки и неверный адрес
  state.editor = editorFor(file, [0, 0])
  state.inputs = ['Cancelled']
  state.score = undefined
  assert.equal((await capture('impactLog.captureSelection')).length, 0)
  state.settings = { appUrl: 'http://example.com' }
  await capture('impactLog.capture')
  assert.equal(state.messages[0]?.level, 'error')
  assert.deepEqual(state.messages[0]?.actions, ['Open Settings'])
  // Хост со спецсимволами: `new URL` его пропускает, normalizeAppUrl — нет (как в CLI и Chrome)
  state.messages = []
  state.settings = { appUrl: 'https://impact&log.com' }
  await capture('impactLog.capture')
  assert.equal(state.messages[0]?.level, 'error')
  assert.equal(state.opened.length, 0)
  console.log('✓ cancel and invalid app URL handled')

  fs.rmSync(root, { recursive: true, force: true })
  console.log('smoke: ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
