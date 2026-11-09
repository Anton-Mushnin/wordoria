import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './lib/supabase.ts'

export type InventoryItem = {
  id: string
  kind: 'skin' | 'subscription_gift'
  skin_id: string | null
  days: number | null
}

export type Profile = {
  id: string
  name: string
  iv: number
  money: number
  xp: number
  subscription_until: string | null
  equipped_skin_id: string | null
  items: InventoryItem[]
}

type AuthValue = {
  ready: boolean
  session: Session | null
  profile: Profile | null
  profileError: string | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ready, setReady] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser()
    const user = userData.user
    if (!user) {
      setProfile(null)
      setProfileError(null)
      return
    }
    const [{ data: row, error }, { data: items }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, name, iv, money, xp, subscription_until, equipped_skin_id')
        .eq('id', user.id)
        .single(),
      supabase.from('inventory').select('id, kind, skin_id, days').eq('player_id', user.id),
    ])
    if (error || !row) {
      setProfile(null)
      setProfileError('Не удалось открыть страницу игрока')
      return
    }
    setProfileError(null)
    setProfile({ ...(row as Omit<Profile, 'items'>), items: (items ?? []) as InventoryItem[] })
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!ready) return
    if (!session) {
      setProfile(null)
      setProfileError(null)
      return
    }
    void refresh()
  }, [ready, session, refresh])

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      session,
      profile,
      profileError,
      refresh,
      signOut: async () => {
        await supabase.auth.signOut()
      },
    }),
    [ready, session, profile, profileError, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider missing')
  return value
}
