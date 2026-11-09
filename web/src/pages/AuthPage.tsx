import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth.tsx'
import { LanguageSwitcher } from '../components/LanguageSwitcher.tsx'
import { useFault } from '../i18n/fault.ts'
import { supabase, supabaseConfigured } from '../lib/supabase.ts'

export function AuthPage() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const formError = useFault()
  const nameError = useFault()
  const [pending, setPending] = useState(false)
  const [naming, setNaming] = useState(false)
  const [notice, setNotice] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    formError.clear()
    setNotice(false)
    if (!supabaseConfigured) {
      formError.local('auth.noSupabase')
      return
    }
    const cleanEmail = email.trim()
    setPending(true)
    const { data: taken, error: lookupError } = await supabase.rpc('email_registered', { target: cleanEmail })
    if (lookupError) {
      setPending(false)
      formError.local('auth.emailCheckFailed')
      return
    }
    if (taken) {
      const { error: signError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
      setPending(false)
      if (signError) formError.local('auth.badCredentials')
      return
    }
    setPending(false)
    setName('')
    nameError.clear()
    setNaming(true)
  }

  async function register(event: FormEvent) {
    event.preventDefault()
    const cleanName = name.trim()
    if (cleanName.length < 2 || cleanName.length > 24) {
      nameError.local('auth.nameLength')
      return
    }
    nameError.clear()
    setPending(true)
    const { data: nameTaken, error: nameLookupError } = await supabase.rpc('name_registered', { target: cleanName })
    if (nameLookupError) {
      setPending(false)
      nameError.local('auth.nameCheckFailed')
      return
    }
    if (nameTaken) {
      setPending(false)
      nameError.local('auth.nameTaken')
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
        nameError.local('auth.nameTaken')
        return
      }
      if (message.includes('already')) {
        setNaming(false)
        formError.local('auth.emailTaken')
        return
      }
      nameError.local('auth.signupFailed')
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
      setNotice(true)
    }
  }

  return (
    <main className="page cover">
      <LanguageSwitcher />
      <p className="eyebrow">{t('auth.eyebrow')}</p>
      <h1>Wordoria</h1>
      <p className="cover-line">{t('auth.tagline')}</p>
      <form className="sheet" onSubmit={(event) => void submit(event)}>
        <label className="label" htmlFor="email">{t('auth.email')}</label>
        <input
          id="email"
          className="plain-input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label className="label" htmlFor="password">{t('auth.password')}</label>
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
        {formError.text ? <p className="error-line" role="alert">{formError.text}</p> : null}
        {notice ? <p className="meta">{t('auth.confirmSent')}</p> : null}
        <button type="submit" disabled={pending}>{t('auth.open')}</button>
      </form>
      {naming ? (
        <NameSlip
          name={name}
          error={nameError.text}
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
  const { t } = useTranslation()
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
        <p className="eyebrow">{t('auth.newBook')}</p>
        <h2>{t('auth.howToSign')}</h2>
        <label className="label" htmlFor="name">{t('auth.coverName')}</label>
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
          <button type="submit" disabled={pending}>{t('auth.createBook')}</button>
          <button type="button" className="quiet" onClick={requestClose} disabled={pending}>{t('auth.notNow')}</button>
        </div>
      </form>
    </dialog>
  )
}
