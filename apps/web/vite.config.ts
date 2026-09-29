import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { pwaServiceWorker } from './src/pwa/swBuildPlugin'

export default defineConfig({
  plugins: [
    vue(),
    // Офлайн-оболочка: /sw.js со списком всех файлов сборки (только build, docs/pwa.md)
    pwaServiceWorker({ source: fileURLToPath(new URL('./src/pwa/sw.ts', import.meta.url)) }),
  ],
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
      // changeOrigin: false — api сверяет Origin с Host (защита от CSRF, plugins/csrf.ts), а строковая форма
      // прокси в Vite подменяет Host на адрес api → любой POST из dev-сервера получал бы 403
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false },
    },
  },
  build: {
    // Ничего не встраиваем как data: URI — строгая CSP (font-src 'self') такое блокирует
    assetsInlineLimit: 0,
    // .map генерируются, но бандл на них не ссылается, а Caddy их не отдаёт (ADR-0002)
    sourcemap: 'hidden',
  },
})
