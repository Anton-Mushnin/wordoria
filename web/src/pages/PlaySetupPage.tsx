import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth.tsx'
import { GAMES } from '../domain.ts'
import { ApiError, callApi } from '../lib/api.ts'
import { supabase } from '../lib/supabase.ts'

type ListChoice = { id: string; title: string }

export function PlaySetupPage() {
  const { gameId = '' } = useParams()
  const game = GAMES.find((item) => item.id === gameId)
  const { profile, refresh } = useAuth()
  const navigate = useNavigate()
  const [lists, setLists] = useState<ListChoice[]>([])
  const [listsReady, setListsReady] = useState(false)
  const [listId, setListId] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    void supabase
      .from('word_lists')
      .select('id, title')
      .order('title')
      .then(({ data }) => {
        const next = (data ?? []).map((row) => ({ id: String(row.id), title: String(row.title) }))
        setLists(next)
        setListId((current) => current || next[0]?.id || '')
        setListsReady(true)
      })
  }, [])

  if (!game) {
    return (
      <>
        <p className="error-line">Такой игры нет.</p>
        <Link to="/">На стол</Link>
      </>
    )
  }

  const free = (profile?.iv ?? 0) < game.costIv

  async function start() {
    setError('')
    setPending(true)
    try {
      const result = await callApi<{ sessionId: string }>({ action: 'session-start', mode: 'solo', gameId: game!.id, listId })
      await refresh()
      navigate(`/session/${result.sessionId}`)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Упражнение не началось')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <p className="eyebrow">{game.name}</p>
      <p className="cover-line">{free ? 'Сейчас бесплатно: ИВ не хватает на цену.' : `Спишется ${game.costIv} ИВ.`}</p>
      <label className="label" htmlFor="list">Список слов</label>
      <select id="list" className="plain-input" value={listId} onChange={(event) => setListId(event.target.value)}>
        {lists.map((list) => (
          <option key={list.id} value={list.id}>{list.title}</option>
        ))}
      </select>
      {listsReady && lists.length === 0 ? <p className="meta">Сначала нужен список слов.</p> : null}
      {error ? <p className="error-line" role="alert">{error}</p> : null}
      <div className="row">
        <button type="button" disabled={!listId || pending} onClick={() => void start()}>
          Начать упражнение
        </button>
        {game.modes.includes('multi') ? <Link className="button" to={`/room?game=${game.id}`}>Собрать комнату</Link> : null}
      </div>
    </>
  )
}
