import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { type Plugin, type ResolvedConfig, transformWithEsbuild } from 'vite'
import { SEO_FILES } from '../seo/seoPlugin'

/*
 * Vite-плагин (только build, выполняется в Node — приложение его не импортирует): собирает /sw.js
 * из src/pwa/sw.ts и вписывает в него список ВСЕХ файлов сборки (index.html, js/css-чанки, в т.ч.
 * ленивые экраны и воркеры, шрифты, файлы из public/) и хеш версии — sha256 от имён и содержимого.
 * Та же сборка → тот же sw.js → браузер не видит «обновления»; изменился любой файл → новая версия.
 * Подробно — docs/pwa.md.
 */

export interface PwaServiceWorkerOptions {
  /** Исходник service worker (TypeScript без импортов значений) */
  source: string
  /** Имя файла в корне сборки */
  fileName?: string
}

/**
 * Что не кладём в кеш: sourcemaps (наружу не отдаются), сам sw.js, служебные файлы (.vite/…, .DS_Store),
 * media/ — картинки для витрин (README расширения VS Code в Marketplace) и всё для превью ссылок и поисковиков
 * (og/, index.en.html, robots.txt, sitemap.xml — src/seo/seoPlugin.ts): приложению они не нужны
 */
function isShellFile(fileName: string, swFileName: string): boolean {
  if (fileName === swFileName || fileName.endsWith('.map')) return false
  if (fileName.startsWith('media/') || fileName.startsWith('og/')) return false
  if ((SEO_FILES as readonly string[]).includes(fileName)) return false
  return !fileName.split('/').some((part) => part.startsWith('.'))
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
}

export function pwaServiceWorker(options: PwaServiceWorkerOptions): Plugin {
  const swFileName = options.fileName ?? 'sw.js'
  let config: ResolvedConfig

  return {
    name: 'impact-log:pwa-service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(resolved) {
      config = resolved
    },
    generateBundle: {
      // После всех плагинов Vite: index.html, CSS, шрифты и воркеры к этому моменту уже в bundle
      order: 'post',
      async handler(_output, bundle) {
        if (config.base !== '/') this.error('PWA: service worker рассчитан на base "/"')

        const files = new Map<string, string | Uint8Array>()
        for (const [fileName, item] of Object.entries(bundle)) {
          if (!isShellFile(fileName, swFileName)) continue
          files.set(fileName, item.type === 'chunk' ? item.code : item.source)
        }
        // public/ Vite копирует сам, мимо bundle
        if (config.publicDir && config.build.copyPublicDir) {
          for (const fileName of listFiles(config.publicDir)) {
            if (isShellFile(fileName, swFileName) && !files.has(fileName)) {
              files.set(fileName, readFileSync(join(config.publicDir, fileName)))
            }
          }
        }
        if (!files.has('index.html')) this.error('PWA: в сборке нет index.html')

        const source = readFileSync(options.source, 'utf8')
        const names = [...files.keys()].sort()
        const hash = createHash('sha256').update(source)
        for (const name of names) hash.update(`\0${name}\0`).update(files.get(name) ?? '')
        const version = hash.digest('hex').slice(0, 16)
        const precache = names.map((name) => `/${name}`)

        const { code } = await transformWithEsbuild(source, options.source, {
          loader: 'ts',
          format: 'iife',
          target: 'es2022',
          legalComments: 'none',
          define: {
            __PWA_VERSION__: JSON.stringify(version),
            __PWA_PRECACHE__: JSON.stringify(precache),
          },
        })
        this.emitFile({
          type: 'asset',
          fileName: swFileName,
          source: `// impact log service worker · версия ${version} · файлов: ${precache.length}\n${code}`,
        })

        const bytes = [...files.values()].reduce((sum, content) => sum + content.length, 0)
        config.logger.info(
          `PWA: ${swFileName} — версия ${version}, в кеш оболочки ${precache.length} файлов (${(bytes / 1024).toFixed(0)} КБ)`,
        )
      },
    },
  }
}
