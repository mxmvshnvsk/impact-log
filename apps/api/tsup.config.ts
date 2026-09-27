import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    server: 'src/server.ts',
    migrate: 'src/db/migrate.ts',
  },
  format: 'esm',
  platform: 'node',
  target: 'node24',
  sourcemap: true,
  clean: true,
  // Общий пакет собираем внутрь бандла, остальные зависимости берутся из node_modules
  noExternal: [/^@impact-log\//],
})
