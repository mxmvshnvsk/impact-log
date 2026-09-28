import { DEFAULT_LOCALE } from '@impact-log/shared'
import { createI18n } from 'vue-i18n'
import { resolveLocale } from '@/utils/locale'
import { readStoredLocale } from '@/utils/localeStorage'
import en from './locales/en.json'
import ru from './locales/ru.json'

export type MessageSchema = typeof ru

type Messages = Record<string, unknown>

/**
 * Словари разделены на общий (locales/<locale>.json) и пространства имён фич
 * (locales/<locale>/<namespace>.json → ключи `<namespace>.*`). Так фичи не правят один большой файл.
 */
const namespaces = import.meta.glob<Messages>('./locales/*/*.json', {
  eager: true,
  import: 'default',
})

function withNamespaces(locale: 'ru' | 'en', base: Messages): Messages {
  const merged: Messages = { ...base }
  for (const [path, messages] of Object.entries(namespaces)) {
    const match = path.match(/^\.\/locales\/(ru|en)\/([\w-]+)\.json$/)
    if (!match || match[1] !== locale) continue
    const namespace = match[2] as string
    if (namespace in merged) throw new Error(`i18n namespace clash: ${namespace}`)
    merged[namespace] = messages
  }
  return merged
}

/**
 * Русские формы множественного числа для `одна | несколько | много` (1 запись | 3 записи | 5 записей).
 * Строки с четырьмя вариантами начинаются с нуля: `нет записей | … | … | …`.
 */
function ruPlural(choice: number, choicesLength: number): number {
  const n = Math.abs(choice)
  const offset = choicesLength === 4 ? 1 : 0
  if (offset && n === 0) return 0
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return offset
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return offset + 1
  return offset + 2
}

const locale = resolveLocale(readStoredLocale(), navigator.languages)
document.documentElement.lang = locale

export const i18n = createI18n<[MessageSchema], 'ru' | 'en', false>({
  legacy: false,
  locale,
  fallbackLocale: DEFAULT_LOCALE,
  pluralRules: { ru: ruPlural },
  messages: {
    ru: withNamespaces('ru', ru) as MessageSchema,
    en: withNamespaces('en', en) as MessageSchema,
  },
})
