import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import enCommon from './locales/en/common.json'
import esCommon from './locales/es/common.json'

export const SUPPORTED_LANGUAGES = ['en', 'es'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export const resources = {
  en: { common: enCommon },
  es: { common: esCommon },
} as const

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    defaultNS: 'common',
    ns: ['common'],
    interpolation: {
      // React already escapes against XSS.
      escapeValue: false,
    },
    detection: {
      // Persist the user's manual choice; profile language overrides at login.
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'hc.lang',
      caches: ['localStorage'],
    },
  })

/** Apply a language coming from the user's profile (source of truth once signed in). */
export function applyProfileLanguage(lang: string | null | undefined) {
  if (lang && (SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) {
    void i18n.changeLanguage(lang)
  }
}

export default i18n
