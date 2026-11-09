import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth.tsx'
import { supabase, supabaseConfigured } from '../lib/supabase.ts'

export function AuthPage() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [nameError, setNameError] = useState('')
  const [pending, setPending] = useState(false)
  const [naming, setNaming] = useState(false)
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
    const cleanEmail = email.trim()
    setPending(true)
    const { data: taken, error: lookupError } = await supabase.rpc('email_registered', { target: cleanEmail })
    if (lookupError) {
      setPending(false)
      setError('Не получилось проверить почту.')
      return
    }
    if (taken) {
      const { error: signError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
      setPending(false)
      if (signError) setError('Почта или пароль не подходят.')
      return
    }
    setPending(false)
    setName('')
    setNameError('')
    setNaming(true)
  }

  async function register(event: FormEvent) {
    event.preventDefault()
    const cleanName = name.trim()
    if (cleanName.length < 2 || cleanName.length > 24) {
      setNameError('Имя нужно от 2 до 24 знаков.')
      return
    }
    setNameError('')
    setPending(true)
    const { data: nameTaken, error: nameLookupError } = await supabase.rpc('name_registered', { target: cleanName })
    if (nameLookupError) {
      setPending(false)
      setNameError('Не получилось проверить имя.')
      return
    }
    if (nameTaken) {
      setPending(false)
      setNameError('Такое имя уже занято.')
      return
    }
    const cleanEmail = email.trim()
    const { data, error: signError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { name: cleanName } },
    })
    if (signError) {
      setPending(false)
      const message = signError.message.toLowerCase()
      if (message.includes('занято')) {
        setNameError('Такое имя уже занято.')
        return
      }
      if (message.includes('already')) {
        setNaming(false)
        setError('Эта почта уже занята.')
        return
      }
      setNameError('Не получилось завести тетрадь. Проверьте имя.')
      return
    }
    if (data.session) {
      setPending(false)
      return
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
    setPending(false)
    if (signInError) {
      setNaming(false)
      setNotice('Письмо с подтверждением отправлено. Откройте его и вернитесь.')
    }
  }

  return (
    <main className="page cover">
      <p className="eyebrow">Тетрадь</p>
      <h1>Wordoria</h1>
      <p className="cover-line">Для чужих слов, которые ещё не стали своими.</p>
      <form className="sheet" onSubmit={(event) => void submit(event)}>
        <label className="label" htmlFor="email">Почта</label>
        <input
          id="email"
          className="plain-input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label className="label" htmlFor="password">Пароль</label>
        <input
          id="password"
          className="plain-input"
          type="password"
          autoComplete="current-password"
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error ? <p className="error-line" role="alert">{error}</p> : null}
        {notice ? <p className="meta">{notice}</p> : null}
        <button type="submit" disabled={pending}>Открыть</button>
      </form>
      {naming ? (
        <NameSlip
          name={name}
          error={nameError}
          pending={pending}
          onName={setName}
          onClose={() => {
            if (!pending) setNaming(false)
          }}
          onSubmit={(event) => void register(event)}
        />
      ) : null}
    </main>
  )
}

function NameSlip({
  name,
  error,
  pending,
  onName,
  onClose,
  onSubmit,
}: {
  name: string
  error: string
  pending: boolean
  onName: (value: string) => void
  onClose: () => void
  onSubmit: (event: FormEvent) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    nameRef.current?.focus()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  function requestClose() {
    if (!pending) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="name-slip"
      onCancel={(event) => {
        if (pending) event.preventDefault()
        else onClose()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) requestClose()
      }}
    >
      <form className="name-card" onSubmit={onSubmit}>
        <p className="eyebrow">Новая тетрадь</p>
        <h2>Как подписать</h2>
        <label className="label" htmlFor="name">Имя на обложке</label>
        <input
          ref={nameRef}
          id="name"
          className="ink-input"
          value={name}
          onChange={(event) => onName(event.target.value)}
          autoComplete="nickname"
          minLength={2}
          maxLength={24}
          required
        />
        {error ? <p className="error-line" role="alert">{error}</p> : null}
        <div className="name-actions">
          <button type="submit" disabled={pending}>Завести тетрадь</button>
          <button type="button" className="quiet" onClick={requestClose} disabled={pending}>Не сейчас</button>
        </div>
      </form>
    </dialog>
  )
}
