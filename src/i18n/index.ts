import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import ru from './ru.json'

export const LANGUAGES = ['en', 'ru'] as const
export type Language = (typeof LANGUAGES)[number]

function syncDocument(lng: string) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = lng
  document.title = i18n.t('app.title')
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ru: { translation: ru } },
    supportedLngs: LANGUAGES as unknown as string[],
    nonExplicitSupportedLngs: true, // ru-RU → ru
    load: 'languageOnly',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], lookupLocalStorage: 'gridfinity.lang', caches: ['localStorage'] },
  })
  .then(() => syncDocument(i18n.resolvedLanguage ?? 'en'))

i18n.on('languageChanged', (lng) => syncDocument(i18n.resolvedLanguage ?? lng))

export default i18n
