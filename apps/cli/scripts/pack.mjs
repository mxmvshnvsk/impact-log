/**
 * Собирает npm-пакет impact-log: dist, README, LICENSE и package.json только с полями для реестра —
 * без devDependencies и scripts. CLI — один самодостаточный файл без зависимостей, а workspace:*
 * из монорепозитория в опубликованном манифесте не нужен (pnpm pack не может его разрешить у core).
 * Результат — apps/cli/impact-log-<версия>.tgz; публикация — `npm publish <tgz>`.
 * Запуск: pnpm --filter impact-log package (сначала сборка).
 */
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const FIELDS = [
  'name',
  'version',
  'description',
  'keywords',
  'license',
  'homepage',
  'repository',
  'bugs',
  'type',
  'bin',
  'files',
  'engines',
]

if (!existsSync(join(root, pkg.bin.impact))) {
  console.error(`pack: no ${pkg.bin.impact} — run the build first`)
  process.exit(1)
}

const stage = mkdtempSync(join(tmpdir(), 'impact-log-pack-'))
try {
  const manifest = Object.fromEntries(
    FIELDS.filter((key) => key in pkg).map((key) => [key, pkg[key]]),
  )
  writeFileSync(join(stage, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  cpSync(join(root, 'dist'), join(stage, 'dist'), { recursive: true })
  copyFileSync(join(root, 'README.md'), join(stage, 'README.md'))
  copyFileSync(join(root, '..', '..', 'LICENSE'), join(stage, 'LICENSE'))
  rmSync(join(root, `${pkg.name}-${pkg.version}.tgz`), { force: true })
  execFileSync('npm', ['pack', '--pack-destination', root], {
    cwd: stage,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
} finally {
  rmSync(stage, { recursive: true, force: true })
}
