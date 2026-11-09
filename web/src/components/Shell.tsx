import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth.tsx'
import { levelFromXp } from '../domain.ts'
import { LanguageSwitcher } from './LanguageSwitcher.tsx'

const links = [
  ['/', 'nav.desk'],
  ['/lists', 'nav.lists'],
  ['/room', 'nav.room'],
  ['/lootbox', 'nav.lootbox'],
  ['/wallet', 'nav.wallet'],
] as const

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()
  if (!profile) return null
  const level = levelFromXp(profile.xp)

  return (
    <>
      <aside className="margin">
        <p className="brand">Wordoria</p>
        <nav>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {t(label)}
            </NavLink>
          ))}
        </nav>
        <div className="margin-out foot">
          <LanguageSwitcher />
          <button type="button" className="quiet" onClick={() => void signOut()}>
            {t('nav.signOut')}
          </button>
        </div>
      </aside>
      <div className="page">
        <header className="page-head">
          <p className="pen-name">{profile.name}</p>
          <div className="grades">
            <span className="grade">{t('shell.iv', { iv: profile.iv })}</span>
            <span className="grade">{t('shell.level', { level })}</span>
          </div>
        </header>
        {children}
      </div>
    </>
  )
}
