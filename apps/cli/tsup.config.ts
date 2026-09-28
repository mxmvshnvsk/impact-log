import { readFileSync } from 'node:fs'
import { defineConfig, type Options } from 'tsup'

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as {
  version: string
}

type EsbuildPlugin = NonNullable<Options['esbuildPlugins']>[number]

/**
 * `import { z } from 'zod'` тянет `z.locales` — ~40 переводов ошибок (≈400 КБ), которые клиентам захвата
 * не нужны (английская локаль по умолчанию подключается zod напрямую). Подменяем индекс локалей пустым модулем.
 */
const dropZodLocales: EsbuildPlugin = {
  name: 'drop-zod-locales',
  setup(build) {
    build.onResolve({ filter: /\/locales\/index\.js$/ }, (args) =>
      /[\\/]zod[\\/]/.test(args.importer) ? { path: 'zod-locales', namespace: 'empty' } : undefined,
    )
    build.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: 'export {}' }))
  },
}

export default defineConfig({
  entry: { impact: 'src/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: false,
  // core (и его zod) собираем внутрь: CLI — один самодостаточный файл
  noExternal: [/^@impact-log\//, 'zod'],
  esbuildPlugins: [dropZodLocales],
  banner: { js: '#!/usr/bin/env node' },
  define: { __IMPACT_VERSION__: JSON.stringify(version) },
})
