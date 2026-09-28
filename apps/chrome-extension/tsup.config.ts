import { defineConfig, type Options } from 'tsup'

type EsbuildPlugin = NonNullable<Options['esbuildPlugins']>[number]

/** Не тянем ~40 локалей zod (см. apps/cli/tsup.config.ts) — английская подключается zod напрямую */
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
  entry: {
    background: 'src/background.ts',
    popup: 'src/popup.ts',
    options: 'src/options.ts',
  },
  format: ['esm'],
  platform: 'browser',
  target: 'chrome120',
  outDir: 'dist',
  clean: true,
  // MV3: каждый entry — самодостаточный файл, без общих чанков
  splitting: false,
  sourcemap: false,
  minify: true,
  noExternal: [/^@impact-log\//, 'zod'],
  esbuildPlugins: [dropZodLocales],
})
