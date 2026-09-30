import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

/*
 * Vite-плагин (выполняется в Node — приложение его не импортирует): мета-теги для превью ссылок и поисковиков.
 * Мессенджеры и соцсети (Telegram, LinkedIn, Slack…) JS не выполняют, поэтому всё нужное — статикой в HTML:
 *   - index.html — теги на русском (язык по умолчанию);
 *   - index.en.html — та же оболочка приложения с английскими тегами; Caddy отдаёт её на ?lang=en
 *     (infra/caddy/Caddyfile), а приложение по этому параметру само включает английский;
 *   - robots.txt и sitemap.xml: у каждой публичной страницы варианты ?lang=ru и ?lang=en (hreflang),
 *     x-default — адрес без параметра (язык выбирается по браузеру).
 * Тексты — ключи seo.* из src/i18n/locales/<locale>.json, картинки — public/og/impact-log-<locale>.png.
 * К адресу картинки дописывается хеш содержимого (?v=…): превью кешируются по URL, новая картинка — новый URL.
 * og:url намеренно не задаём: одна и та же оболочка отдаётся на любой путь SPA, иначе все страницы «склеятся» в /.
 */

type Locale = 'ru' | 'en'

interface SeoStrings {
  title: string
  ogTitle: string
  description: string
  imageAlt: string
}

export interface SeoMetaOptions {
  /** Адрес сайта без / на конце */
  siteUrl: string
  /** Репозиторий — sameAs в JSON-LD */
  sourceUrl: string
  /** src/i18n/locales */
  localesDir: string
  /** public/ — там лежат картинки превью */
  publicDir: string
  /** Публичные страницы для sitemap.xml */
  pages: readonly string[]
}

const LOCALES: readonly Locale[] = ['ru', 'en']
const DEFAULT_LOCALE: Locale = 'ru'
const OG_LOCALE: Record<Locale, string> = { ru: 'ru_RU', en: 'en_US' }
const START = '<!-- seo:start -->'
const END = '<!-- seo:end -->'
const PLACEHOLDER = '<!-- seo -->'

/** Файлы, которые выпускает плагин (service worker их не кеширует — src/pwa/swBuildPlugin.ts) */
export const SEO_FILES = ['index.en.html', 'robots.txt', 'sitemap.xml'] as const

const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function readStrings(localesDir: string, locale: Locale): SeoStrings {
  const messages = JSON.parse(readFileSync(join(localesDir, `${locale}.json`), 'utf8'))
  const seo = messages.seo as Partial<SeoStrings> | undefined
  for (const key of ['title', 'ogTitle', 'description', 'imageAlt'] as const) {
    if (typeof seo?.[key] !== 'string' || !seo[key]) {
      throw new Error(`seo: нет строки seo.${key} в ${locale}.json`)
    }
  }
  return seo as SeoStrings
}

/** Размер PNG из заголовка IHDR */
function pngSize(bytes: Buffer): { width: number; height: number } {
  const signature = '89504e470d0a1a0a'
  if (bytes.subarray(0, 8).toString('hex') !== signature)
    throw new Error('seo: картинка превью — не PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

export function seoMeta(options: SeoMetaOptions): Plugin {
  const site = options.siteUrl.replace(/\/+$/, '')

  function image(locale: Locale) {
    const path = `og/impact-log-${locale}.png`
    const bytes = readFileSync(join(options.publicDir, path))
    const version = createHash('sha256').update(bytes).digest('hex').slice(0, 10)
    return { url: `${site}/${path}?v=${version}`, ...pngSize(bytes) }
  }

  function block(locale: Locale): string {
    const text = readStrings(options.localesDir, locale)
    const img = image(locale)
    const alternate = LOCALES.filter((other) => other !== locale)
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'impact log',
      url: `${site}/`,
      description: text.description,
      inLanguage: locale,
      applicationCategory: 'ProductivityApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires JavaScript',
      sameAs: [options.sourceUrl],
    }).replace(/</g, '\\u003c')
    const meta = [
      ['name', 'description', text.description],
      ['property', 'og:type', 'website'],
      ['property', 'og:site_name', 'impact log'],
      ['property', 'og:title', text.ogTitle],
      ['property', 'og:description', text.description],
      ['property', 'og:locale', OG_LOCALE[locale]],
      ...alternate.map((other) => ['property', 'og:locale:alternate', OG_LOCALE[other]]),
      ['property', 'og:image', img.url],
      ['property', 'og:image:type', 'image/png'],
      ['property', 'og:image:width', String(img.width)],
      ['property', 'og:image:height', String(img.height)],
      ['property', 'og:image:alt', text.imageAlt],
      ['name', 'twitter:card', 'summary_large_image'],
      ['name', 'twitter:title', text.ogTitle],
      ['name', 'twitter:description', text.description],
      ['name', 'twitter:image', img.url],
      ['name', 'twitter:image:alt', text.imageAlt],
    ] as const
    return [
      START,
      ...meta.map(
        ([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeAttr(value)}" />`,
      ),
      `<script type="application/ld+json">${jsonLd}</script>`,
      END,
    ].join('\n    ')
  }

  /** Язык документа, заголовок и блок тегов — под нужный язык */
  function localize(html: string, locale: Locale): string {
    const title = readStrings(options.localesDir, locale).title
    const tags = block(locale)
    const withBlock = html.includes(START)
      ? html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), () => tags)
      : html.replace(PLACEHOLDER, () => tags)
    if (!withBlock.includes(START)) throw new Error(`seo: в index.html нет ${PLACEHOLDER}`)
    return withBlock
      .replace(/<html lang="[^"]*">/, `<html lang="${locale}">`)
      .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapeAttr(title)}</title>`)
  }

  const stripMarkers = (html: string) =>
    html.replace(`${START}\n    `, '').replace(`\n    ${END}`, '')

  function sitemap(): string {
    const urls: string[] = []
    for (const page of options.pages) {
      const variants: [string, string][] = [
        ...LOCALES.map((locale): [string, string] => [locale, `${site}${page}?lang=${locale}`]),
        ['x-default', `${site}${page}`],
      ]
      const links = variants
        .map(
          ([lang, href]) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${href}"/>`,
        )
        .join('\n')
      for (const [, loc] of variants)
        urls.push(`  <url>\n    <loc>${loc}</loc>\n${links}\n  </url>`)
    }
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
      ...urls,
      '</urlset>',
      '',
    ].join('\n')
  }

  return {
    name: 'impact-log:seo-meta',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => localize(html, DEFAULT_LOCALE),
    },
    generateBundle(_output, bundle) {
      // Раньше, чем service worker (его generateBundle — order: 'post') посчитает версию по index.html
      const index = bundle['index.html']
      if (index?.type !== 'asset') this.error('seo: в сборке нет index.html')
      const html = String(index.source)
      index.source = stripMarkers(html)
      this.emitFile({
        type: 'asset',
        fileName: 'index.en.html',
        source: stripMarkers(localize(html, 'en')),
      })
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nDisallow: /api/\n\nSitemap: ${site}/sitemap.xml\n`,
      })
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap() })
    },
  }
}
