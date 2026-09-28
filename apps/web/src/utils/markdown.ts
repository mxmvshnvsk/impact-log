import DOMPurify from 'dompurify'
import { Marked, type Tokens } from 'marked'

/*
 * Markdown записей → безопасный HTML. Пользовательский текст считаем недоверенным (записи могут прийти
 * из синхронизации, импорта или ссылки захвата): marked → DOMPurify, внешние картинки не загружаем
 * (превращаем в ссылки — никаких запросов на чужие серверы при просмотре), ссылки открываются в новой
 * вкладке без передачи referrer. Сырой HTML в тексте записи не исполняется, а показывается как текст:
 * иначе запись могла бы нарисовать «элементы интерфейса» классами и разметкой приложения. Атрибут class
 * остаётся только у разметки, которую генерируем мы сами (галочки списков задач, язык блока кода).
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const markdown = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  renderer: {
    image({ href, title, text }: Tokens.Image) {
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
      return `<a href="${escapeHtml(href)}"${titleAttr}>${escapeHtml(text || href)}</a>`
    },
    // Сырой HTML пользователя — только как текст
    html({ text, block }: Tokens.HTML | Tokens.Tag) {
      const escaped = escapeHtml(text)
      return block ? `<p>${escaped.trim().replace(/\n/g, '<br>')}</p>\n` : escaped
    },
    checkbox({ checked }: Tokens.Checkbox) {
      return `<span class="md-check${checked ? ' md-check--done' : ''}" aria-hidden="true">${checked ? '✓' : ''}</span>`
    },
  },
})

// Отдельный экземпляр DOMPurify: наши хуки не влияют на остальной код
const purify = DOMPurify(window)

/** Классы, которые генерирует сам рендерер: галочки task-list и язык блока кода (```js → language-js) */
const ALLOWED_CLASS = /^(md-check|md-check--done|language-[\w#+.-]{1,40})$/

purify.addHook('uponSanitizeAttribute', (_node, data) => {
  if (data.attrName !== 'class') return
  const tokens = data.attrValue.split(/\s+/).filter(Boolean)
  if (tokens.length === 0 || !tokens.every((token) => ALLOWED_CLASS.test(token))) {
    data.keepAttr = false
  }
})

purify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

const PURIFY_CONFIG = {
  FORBID_TAGS: [
    'img',
    'picture',
    'source',
    'video',
    'audio',
    'track',
    'iframe',
    'object',
    'embed',
    'style',
    'link',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'svg',
    'math',
  ],
  FORBID_ATTR: ['style', 'src', 'srcset', 'background', 'poster', 'formaction', 'id', 'name'],
  ALLOW_DATA_ATTR: false,
}

/**
 * @param headingOffset сдвиг уровней заголовков: «# » в записи внутри страницы с h1/h2 станет h3
 */
export function renderMarkdown(source: string, headingOffset = 0): string {
  if (!source.trim()) return ''
  const tokens = markdown.lexer(source)
  if (headingOffset) {
    markdown.walkTokens(tokens, (token) => {
      if (token.type === 'heading') token.depth = Math.min(6, token.depth + headingOffset)
    })
  }
  const html = markdown.parser(tokens)
  return purify.sanitize(html, PURIFY_CONFIG)
}
