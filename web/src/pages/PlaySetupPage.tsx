import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth.tsx'
import { GAMES } from '../domain.ts'
import { useFault } from '../i18n/fault.ts'
import { gameName } from '../i18n/labels.ts'
import { callApi } from '../lib/api.ts'
import { supabase } from '../lib/supabase.ts'

type ListChoice = { id: string; title: string }

export function PlaySetupPage() {
  const { t } = useTranslation()
  const { gameId = '' } = useParams()
  const game = GAMES.find((item) => item.id === gameId)
  const { profile, refresh } = useAuth()
  const navigate = useNavigate()
  const [lists, setLists] = useState<ListChoice[]>([])
  const [listsReady, setListsReady] = useState(false)
  const [listId, setListId] = useState('')
  const fault = useFault()
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
        <p className="error-line">{t('play.missing')}</p>
        <Link to="/">{t('play.back')}</Link>
      </>
    )
  }

  const free = (profile?.iv ?? 0) < game.costIv

  async function start() {
    fault.clear()
    setPending(true)
    try {
      const result = await callApi<{ sessionId: string }>({ action: 'session-start', mode: 'solo', gameId: game!.id, listId })
      await refresh()
      navigate(`/session/${result.sessionId}`)
    } catch (caught) {
      fault.caught(caught, 'play.startFailed')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <p className="eyebrow">{gameName(t, game.id, game.name)}</p>
      <p className="cover-line">{free ? t('play.free') : t('play.charge', { iv: game.costIv })}</p>
      <label className="label" htmlFor="list">{t('play.list')}</label>
      <select id="list" className="plain-input" value={listId} onChange={(event) => setListId(event.target.value)}>
        {lists.map((list) => (
          <option key={list.id} value={list.id}>{list.title}</option>
        ))}
      </select>
      {listsReady && lists.length === 0 ? <p className="meta">{t('play.needList')}</p> : null}
      {fault.text ? <p className="error-line" role="alert">{fault.text}</p> : null}
      <div className="row">
        <button type="button" disabled={!listId || pending} onClick={() => void start()}>
          {t('play.start')}
        </button>
        {game.modes.includes('multi') ? <Link className="button" to={`/room?game=${game.id}`}>{t('play.gather')}</Link> : null}
      </div>
    </>
  )
}
