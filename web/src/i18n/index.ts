import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import fi from './locales/fi.json'
import ru from './locales/ru.json'

export const locales = ['ru', 'en', 'fi'] as const
export type Locale = (typeof locales)[number]

const enCatalog: typeof ru = en
const fiCatalog: typeof ru = fi
void enCatalog
void fiCatalog

function applyLang(language: string) {
  document.documentElement.lang = language.slice(0, 2)
}

void i18n.use(LanguageDetector).use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
    fi: { translation: fi },
  },
  fallbackLng: 'ru',
  supportedLngs: [...locales],
  load: 'languageOnly',
  nonExplicitSupportedLngs: true,
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
  detection: {
    order: ['localStorage', 'navigator'],
    caches: ['localStorage'],
    lookupLocalStorage: 'wordoria.lang',
  },
  react: { useSuspense: false },
})

applyLang(i18n.resolvedLanguage ?? i18n.language)
i18n.on('languageChanged', applyLang)

export function placeContext(count: number, language: string) {
  if (!language.toLowerCase().startsWith('en')) return undefined
  const mod100 = count % 100
  const mod10 = count % 10
  if (mod100 >= 11 && mod100 <= 13) return 'th' as const
  if (mod10 === 1) return 'st' as const
  if (mod10 === 2) return 'nd' as const
  if (mod10 === 3) return 'rd' as const
  return 'th' as const
}

export default i18n
