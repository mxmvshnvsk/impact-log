import { DEFAULT_LOCALE } from '@impact-log/shared'
import { createI18n } from 'vue-i18n'
import { resolveLocale } from '@/utils/locale'
import { readStoredLocale } from '@/utils/localeStorage'
import en from './locales/en.json'
import ru from './locales/ru.json'

export type MessageSchema = typeof ru

const locale = resolveLocale(readStoredLocale(), navigator.languages)
document.documentElement.lang = locale

export const i18n = createI18n<[MessageSchema], 'ru' | 'en', false>({
  legacy: false,
  locale,
  fallbackLocale: DEFAULT_LOCALE,
  messages: { ru, en },
})
