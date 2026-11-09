import { useTranslation } from 'react-i18next'
import { locales, type Locale } from '../i18n/index.ts'

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const current = (i18n.resolvedLanguage ?? i18n.language).slice(0, 2)

  return (
    <div className="switcher" role="group" aria-label={t('lang.label')}>
      {locales.map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={code === current}
          onClick={() => void i18n.changeLanguage(code satisfies Locale)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
