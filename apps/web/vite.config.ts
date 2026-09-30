import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { SITE_URL, SOURCE_URL } from './src/constants/links'
import { pwaServiceWorker } from './src/pwa/swBuildPlugin'
import { seoMeta } from './src/seo/seoPlugin'

export default defineConfig({
  plugins: [
    vue(),
    // Офлайн-оболочка: /sw.js со списком всех файлов сборки (только build, docs/pwa.md)
    pwaServiceWorker({ source: fileURLToPath(new URL('./src/pwa/sw.ts', import.meta.url)) }),
    // Превью ссылок (Open Graph) и SEO: теги в index.html, index.en.html для ?lang=en, robots.txt, sitemap.xml
    seoMeta({
      siteUrl: SITE_URL,
      sourceUrl: SOURCE_URL,
      localesDir: fileURLToPath(new URL('./src/i18n/locales', import.meta.url)),
      publicDir: fileURLToPath(new URL('./public', import.meta.url)),
      pages: ['/', '/principles'],
    }),
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
