/**
 * Смоук-проверка CLI как у пользователя: запускает команду `impact` (по умолчанию dist/impact.js,
 * либо IMPACT_BIN — например, установленный из npm-пакета бинарник) и проверяет основные сценарии:
 * версия, add → JSON/ссылка → decode, ошибки ввода (код 1), impact git во временном репозитории,
 * config с временным XDG_CONFIG_HOME, русская справка. Браузер не открывается (--json/--print).
 * Запуск: pnpm --filter impact-log build && pnpm --filter impact-log smoke
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const [command, ...prefix] = process.env.IMPACT_BIN
  ? [process.env.IMPACT_BIN]
  : [process.execPath, join(root, 'dist/impact.js')]
const tmp = mkdtempSync(join(tmpdir(), 'impact-smoke-'))
const env = {
  ...process.env,
  XDG_CONFIG_HOME: join(tmp, 'config'),
  LANG: 'en_US.UTF-8',
  LC_ALL: '',
  IMPACT_LOG_URL: '',
}

function run(args, options = {}) {
  const result = spawnSync(command, [...prefix, ...args], {
    encoding: 'utf8',
    env: { ...env, ...options.env },
    cwd: options.cwd,
    input: '',
  })
  return { code: result.status, out: result.stdout.trim(), err: result.stderr.trim() }
}
function ok(args, options) {
  const result = run(args, options)
  assert.equal(result.code, 0, `impact ${args.join(' ')} → ${result.code}: ${result.err}`)
  return result.out
}
const step = (name) => console.log(`✓ ${name}`)

try {
  assert.equal(ok(['--version']), version)
  assert.match(ok(['--help']), /impact add/)
  step(`version ${version}, help`)

  const draft = JSON.parse(
    ok([
      'add',
      'Sped up CI',
      '-s',
      '4',
      '-l',
      'ci,perf',
      '--link',
      'https://github.com/org/repo/pull/42',
      '-m',
      'Build time=12->4 min',
      '--json',
    ]),
  )
  assert.equal(draft.title, 'Sped up CI')
  assert.equal(draft.impactScore, 4)
  assert.deepEqual(draft.labels, ['ci', 'perf'])
  assert.deepEqual(draft.evidence[0], {
    kind: 'pr',
    url: 'https://github.com/org/repo/pull/42',
    ref: '#42',
  })
  assert.deepEqual(draft.metrics[0], { label: 'Build time', value: 4, unit: 'min', baseline: 12 })
  step('add --json')

  const link = ok(['add', 'Sped up CI', '-s', '4', '--print'])
  assert.match(link, /^https:\/\/impact-log\.com\/capture#draft=[\w-]+$/)
  const decoded = JSON.parse(ok(['decode', link]))
  assert.equal(decoded.title, 'Sped up CI')
  assert.equal(decoded.impactScore, 4)
  step('add --print → decode')

  assert.equal(run(['add', '--print']).code, 1, 'no title → exit 1')
  assert.equal(
    run(['add', 'x', '--print', '--app-url', 'http://example.com']).code,
    1,
    'http app URL → exit 1',
  )
  assert.equal(run(['add', 'x', '-s', '7', '--print']).code, 1, 'score 7 → exit 1')
  step('input errors → exit 1')

  const repo = join(tmp, 'repo')
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim()
  execFileSync('git', ['init', '-q', '-b', 'main', repo])
  git('config', 'user.name', 'Smoke')
  git('config', 'user.email', 'smoke@example.com')
  git(
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'perf: cache dependencies in CI',
    '-m',
    'Build time 12 → 4 min.',
  )
  git('remote', 'add', 'origin', 'git@github.com:org/repo.git')
  const sha = git('rev-parse', 'HEAD')
  const commit = JSON.parse(ok(['git', '-s', '3', '--json'], { cwd: repo }))
  assert.equal(commit.title, 'perf: cache dependencies in CI')
  assert.match(commit.description, /Build time 12 → 4 min/)
  assert.ok(
    commit.evidence.some(
      (e) => e.kind === 'commit' && e.url === `https://github.com/org/repo/commit/${sha}`,
    ),
  )
  step('git --json')

  ok(['config', 'set', 'app-url', 'http://localhost:5173'])
  assert.match(ok(['config', 'get']), /http:\/\/localhost:5173/)
  assert.match(ok(['add', 'x', '--print']), /^http:\/\/localhost:5173\/capture#draft=/)
  ok(['config', 'unset', 'app-url'])
  assert.match(ok(['config', 'get']), /https:\/\/impact-log\.com/)
  step('config set/get/unset')

  assert.match(ok(['--help'], { env: { LANG: 'ru_RU.UTF-8' } }), /быстрый захват/)
  step('ru help')

  console.log('smoke: ok')
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
