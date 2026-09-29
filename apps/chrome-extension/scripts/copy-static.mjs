/**
 * Копирует static/ в dist/ (manifest, html, css, _locales, icons), проставляет версию из package.json
 * и проверяет результат: manifest — валидный JSON MV3, все упомянутые файлы есть в dist,
 * __MSG_*__ и data-i18n-ключи есть во всех локалях. Любая проблема — ненулевой код выхода.
 */
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

cpSync(join(root, 'static'), dist, { recursive: true })
// Лицензия (AGPL-3.0) едет вместе с каждой распространяемой сборкой
cpSync(join(root, '..', '..', 'LICENSE'), join(dist, 'LICENSE'))

const { version } = readJson(join(root, 'package.json'))
const manifest = readJson(join(dist, 'manifest.json'))
manifest.version = version
writeFileSync(join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

/* ---------- проверки ---------- */

const problems = []
const expect = (condition, message) => {
  if (!condition) problems.push(message)
}

expect(manifest.manifest_version === 3, 'manifest_version must be 3')
expect(/^\d+(\.\d+){0,3}$/.test(manifest.version), `bad version ${manifest.version}`)
expect(manifest.background?.type === 'module', 'background.type must be "module"')
expect(!manifest.host_permissions, 'host_permissions are not allowed')
expect(
  JSON.stringify([...manifest.permissions].sort()) ===
    JSON.stringify(['activeTab', 'contextMenus', 'scripting', 'storage']),
  `unexpected permissions ${manifest.permissions}`,
)

const files = new Set([
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_ui.page,
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
])
for (const file of files) expect(existsSync(join(dist, file)), `missing dist/${file}`)

// html → подключённые скрипты, стили и картинки
for (const page of [manifest.action.default_popup, manifest.options_ui.page]) {
  const html = readFileSync(join(dist, page), 'utf8')
  for (const [, ref] of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) {
    expect(existsSync(join(dist, ref)), `${page}: missing ${ref}`)
  }
}

// локали: одинаковые ключи, все __MSG_x__ и data-i18n* существуют
const locales = readdirSync(join(dist, '_locales'))
const messages = Object.fromEntries(
  locales.map((locale) => [locale, readJson(join(dist, '_locales', locale, 'messages.json'))]),
)
expect(manifest.default_locale in messages, `default_locale ${manifest.default_locale} missing`)
const reference = Object.keys(messages[manifest.default_locale] ?? {}).sort()
for (const locale of locales) {
  const keys = Object.keys(messages[locale]).sort()
  expect(JSON.stringify(keys) === JSON.stringify(reference), `${locale}: keys differ from default`)
}
const used = new Set()
for (const [, key] of JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)) used.add(key)
for (const page of [manifest.action.default_popup, manifest.options_ui.page]) {
  const html = readFileSync(join(dist, page), 'utf8')
  for (const [, key] of html.matchAll(/data-i18n(?:-[a-z-]+)?="(\w+)"/g)) used.add(key)
}
for (const key of used) {
  for (const locale of locales) expect(key in messages[locale], `${locale}: missing message ${key}`)
}

if (problems.length) {
  console.error(`chrome-extension: dist is invalid:\n  - ${problems.join('\n  - ')}`)
  process.exit(1)
}
console.log(
  `chrome-extension: dist ready (v${version}, ${files.size} manifest files, ${used.size} messages × ${locales.length} locales)`,
)
