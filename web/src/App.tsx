import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth.tsx'
import { Shell } from './components/Shell.tsx'
import { AuthPage } from './pages/AuthPage.tsx'
import { DeskPage } from './pages/DeskPage.tsx'
import { ListsPage } from './pages/ListsPage.tsx'
import { LootboxPage } from './pages/LootboxPage.tsx'
import { PlaySetupPage } from './pages/PlaySetupPage.tsx'
import { RoomHomePage, RoomTablePage } from './pages/RoomPage.tsx'
import { SessionPage } from './pages/SessionPage.tsx'
import { WalletPage } from './pages/WalletPage.tsx'

function Private({ children }: { children: ReactNode }) {
  const { ready, session, profile, profileError, refresh } = useAuth()
  if (!ready || (session && !profile && !profileError)) return <p className="page meta">Открываю тетрадь…</p>
  if (!session) return <Navigate to="/login" replace />
  if (profileError || !profile) {
    return (
      <main className="page">
        <p className="error-line">{profileError ?? 'Страница игрока не открылась'}</p>
        <button type="button" onClick={() => void refresh()}>Повторить</button>
      </main>
    )
  }
  return <Shell>{children}</Shell>
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/" element={<Private><DeskPage /></Private>} />
      <Route path="/lists" element={<Private><ListsPage /></Private>} />
      <Route path="/play/:gameId" element={<Private><PlaySetupPage /></Private>} />
      <Route path="/session/:sessionId" element={<Private><SessionPage /></Private>} />
      <Route path="/wallet" element={<Private><WalletPage /></Private>} />
      <Route path="/lootbox" element={<Private><LootboxPage /></Private>} />
      <Route path="/room" element={<Private><RoomHomePage /></Private>} />
      <Route path="/room/:roomId" element={<Private><RoomTablePage /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
