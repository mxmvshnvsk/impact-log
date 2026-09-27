import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
  build: {
    // Ничего не встраиваем как data: URI — строгая CSP (font-src 'self') такое блокирует
    assetsInlineLimit: 0,
    // .map генерируются, но бандл на них не ссылается, а Caddy их не отдаёт (ADR-0002)
    sourcemap: 'hidden',
  },
})
