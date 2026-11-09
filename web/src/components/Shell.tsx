import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth.tsx'
import { levelFromXp } from '../domain.ts'

const links = [
  ['/', 'Стол'],
  ['/lists', 'Списки'],
  ['/room', 'Комната'],
  ['/lootbox', 'Конверт'],
  ['/wallet', 'Перевод'],
] as const

export function Shell({ children }: { children: ReactNode }) {
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
              {label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="quiet margin-out" onClick={() => void signOut()}>
          Выйти
        </button>
      </aside>
      <div className="page">
        <header className="page-head">
          <p className="pen-name">{profile.name}</p>
          <div className="grades">
            <span className="grade">ИВ {profile.iv}</span>
            <span className="grade">ур. {level}</span>
          </div>
        </header>
        {children}
      </div>
    </>
  )
}
