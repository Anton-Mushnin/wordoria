import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth.tsx'
import { supabase, supabaseConfigured } from '../lib/supabase.ts'

export function AuthPage() {
  const { session } = useAuth()
  const [mode, setMode] = useState<'register' | 'login'>('register')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')

  if (session) return <Navigate to="/" replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!supabaseConfigured) {
      setError('Нет адреса Supabase. Заполните web/.env.local и перезапустите приложение.')
      return
    }
    const cleanName = name.trim()
    if (mode === 'register' && (cleanName.length < 2 || cleanName.length > 24)) {
      setError('Имя нужно от 2 до 24 знаков.')
      return
    }
    setPending(true)
    if (mode === 'register') {
      const { data, error: signError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: cleanName } },
      })
      setPending(false)
      if (signError) {
        setError(signError.message.includes('already') ? 'Эта почта уже занята.' : 'Не получилось завести тетрадь. Проверьте имя и почту.')
        return
      }
      if (!data.session) setNotice('Письмо с подтверждением отправлено. Откройте его и вернитесь.')
      return
    }
    const { error: signError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setPending(false)
    if (signError) setError('Почта или пароль не подходят.')
  }

  return (
    <main className="page cover">
      <p className="eyebrow">Тетрадь</p>
      <h1>Wordoria</h1>
      <p className="cover-line">Для чужих слов, которые ещё не стали своими.</p>
      <form className="sheet" onSubmit={(event) => void submit(event)}>
        {mode === 'register' ? (
          <>
            <label className="label" htmlFor="name">Как подписать тетрадь</label>
            <input id="name" className="ink-input" value={name} onChange={(event) => setName(event.target.value)} required />
          </>
        ) : null}
        <label className="label" htmlFor="email">Почта</label>
        <input id="email" className="plain-input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <label className="label" htmlFor="password">Пароль</label>
        <input
          id="password"
          className="plain-input"
          type="password"
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error ? <p className="error-line" role="alert">{error}</p> : null}
        {notice ? <p className="meta">{notice}</p> : null}
        <button type="submit" disabled={pending}>
          {mode === 'register' ? 'Завести тетрадь' : 'Открыть свою'}
        </button>
      </form>
      <p className="switcher">
        <button
          type="button"
          className="quiet"
          onClick={() => {
            setMode(mode === 'register' ? 'login' : 'register')
            setError('')
          }}
        >
          {mode === 'register' ? 'У меня уже есть тетрадь' : 'Завести новую'}
        </button>
      </p>
    </main>
  )
}
