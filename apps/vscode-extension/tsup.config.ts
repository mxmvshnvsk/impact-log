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
  entry: { extension: 'src/extension.ts' },
  // Extension host VS Code 1.90 — Electron 29 / Node 20, CommonJS
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  outExtension: () => ({ js: '.cjs' }),
  clean: true,
  splitting: false,
  sourcemap: false,
  minify: true,
  external: ['vscode'],
  noExternal: [/^@impact-log\//, 'zod'],
  esbuildPlugins: [dropZodLocales],
})
