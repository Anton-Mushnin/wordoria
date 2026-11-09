import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth.tsx'
import { useFault } from '../i18n/fault.ts'
import { currencyLabel, ledgerLabel } from '../i18n/labels.ts'
import { callApi } from '../lib/api.ts'
import { supabase } from '../lib/supabase.ts'

type Entry = { id: string; kind: string; currency: string; amount: number; created_at: string }

export function WalletPage() {
  const { t } = useTranslation()
  const { profile, refresh, session } = useAuth()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('10')
  const [entries, setEntries] = useState<Entry[]>([])
  const fault = useFault()
  const [pending, setPending] = useState(false)

  async function load() {
    if (!session) return
    const { data } = await supabase
      .from('ledger')
      .select('id, kind, currency, amount, created_at')
      .eq('player_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setEntries((data ?? []) as Entry[])
  }

  useEffect(() => {
    void load()
  }, [session])

  async function transfer(event: FormEvent) {
    event.preventDefault()
    fault.clear()
    const sum = Number(amount)
    if (!name.trim() || !Number.isInteger(sum) || sum <= 0) {
      fault.local('wallet.badAmount')
      return
    }
    setPending(true)
    try {
      await callApi({ action: 'transfer-iv', toName: name.trim(), amount: sum })
      setName('')
      await refresh()
      await load()
    } catch (caught) {
      fault.caught(caught, 'wallet.failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <p className="eyebrow">{t('wallet.eyebrow')}</p>
      <p className="cover-line">{t('wallet.balance', { iv: profile?.iv ?? 0 })}</p>
      <form className="sheet" onSubmit={(event) => void transfer(event)}>
        <label className="label" htmlFor="to">{t('wallet.name')}</label>
        <input id="to" className="plain-input" value={name} onChange={(event) => setName(event.target.value)} />
        <label className="label" htmlFor="amount">{t('wallet.amount')}</label>
        <input id="amount" className="plain-input" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
        {fault.text ? <p className="error-line" role="alert">{fault.text}</p> : null}
        <button type="submit" disabled={pending}>{t('wallet.send')}</button>
      </form>
      <ul className="ledger">
        {entries.map((entry) => (
          <li key={entry.id}>
            <span>{ledgerLabel(t, entry.kind)}</span>
            <span className="amount">
              {entry.amount > 0 ? '+' : ''}
              {entry.amount} {currencyLabel(t, entry.currency)}
            </span>
          </li>
        ))}
      </ul>
      {entries.length === 0 ? <p className="meta">{t('wallet.empty')}</p> : null}
    </>
  )
}
