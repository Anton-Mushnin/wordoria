import 'i18next'
import type ru from './locales/ru.json'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    returnNull: false
    resources: {
      translation: typeof ru
    }
  }
}
