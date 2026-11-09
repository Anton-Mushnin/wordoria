import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth.tsx'
import { ApiError, callApi } from '../lib/api.ts'
import { supabase } from '../lib/supabase.ts'

const labels: Record<string, string> = {
  exercise_fee: 'Плата за упражнение',
  exercise_reward: 'Награда за упражнение',
  exercise_xp: 'Пункты уровня',
  transfer_out: 'Перевод',
  transfer_in: 'Входящий перевод',
  lootbox_purchase: 'Конверт',
  lootbox_money: 'Деньги из конверта',
  lootbox_xp: 'Уровень из конверта',
}

type Entry = { id: string; kind: string; currency: string; amount: number; created_at: string }

export function WalletPage() {
  const { profile, refresh, session } = useAuth()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('10')
  const [entries, setEntries] = useState<Entry[]>([])
  const [error, setError] = useState('')
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
    setError('')
    const sum = Number(amount)
    if (!name.trim() || !Number.isInteger(sum) || sum <= 0) {
      setError('Нужны имя и целое число ИВ.')
      return
    }
    setPending(true)
    try {
      await callApi({ action: 'transfer-iv', toName: name.trim(), amount: sum })
      setName('')
      await refresh()
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Перевод не прошёл')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <p className="eyebrow">Перевод ИВ</p>
      <p className="cover-line">На странице {profile?.iv ?? 0} ИВ.</p>
      <form className="sheet" onSubmit={(event) => void transfer(event)}>
        <label className="label" htmlFor="to">Имя игрока</label>
        <input id="to" className="plain-input" value={name} onChange={(event) => setName(event.target.value)} />
        <label className="label" htmlFor="amount">Сколько ИВ</label>
        <input id="amount" className="plain-input" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} />
        {error ? <p className="error-line" role="alert">{error}</p> : null}
        <button type="submit" disabled={pending}>Перевести</button>
      </form>
      <ul className="ledger">
        {entries.map((entry) => (
          <li key={entry.id}>
            <span>{labels[entry.kind] ?? entry.kind}</span>
            <span className="amount">
              {entry.amount > 0 ? '+' : ''}
              {entry.amount} {entry.currency === 'iv' ? 'ИВ' : entry.currency === 'xp' ? 'ур.' : 'денег'}
            </span>
          </li>
        ))}
      </ul>
      {entries.length === 0 ? <p className="meta">Движений пока нет.</p> : null}
    </>
  )
}
