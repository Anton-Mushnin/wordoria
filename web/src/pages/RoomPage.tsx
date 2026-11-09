import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth.tsx'
import { GAMES } from '../domain.ts'
import { useFault } from '../i18n/fault.ts'
import { gameName } from '../i18n/labels.ts'
import { callApi } from '../lib/api.ts'
import { supabase } from '../lib/supabase.ts'

type ListChoice = { id: string; title: string }
type RoomRow = {
  id: string
  code: string
  host_id: string
  list_id: string
  game_id: string
  status: 'lobby' | 'playing' | 'done'
  session_id: string | null
}

export function RoomHomePage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const multiGames = GAMES.filter((game) => game.modes.includes('multi'))
  const [gameId, setGameId] = useState(params.get('game') || multiGames[0]?.id || '')
  const [lists, setLists] = useState<ListChoice[]>([])
  const [listId, setListId] = useState('')
  const [code, setCode] = useState('')
  const fault = useFault()
  const [pending, setPending] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    void supabase
      .from('word_lists')
      .select('id, title')
      .order('title')
      .then(({ data }) => {
        const next = (data ?? []).map((row) => ({ id: String(row.id), title: String(row.title) }))
        setLists(next)
        setListId((current) => current || next[0]?.id || '')
      })
  }, [])

  async function createRoom() {
    setPending(true)
    fault.clear()
    try {
      const room = await callApi<{ id: string }>({ action: 'room-create', gameId, listId })
      navigate(`/room/${room.id}`)
    } catch (caught) {
      fault.caught(caught, 'room.createFailed')
    } finally {
      setPending(false)
    }
  }

  async function join(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    fault.clear()
    try {
      const room = await callApi<{ id: string }>({ action: 'room-join', code })
      navigate(`/room/${room.id}`)
    } catch (caught) {
      fault.caught(caught, 'room.joinFailed')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <p className="eyebrow">{t('room.eyebrow')}</p>
      <p className="cover-line">{t('room.blurb')}</p>
      <label className="label" htmlFor="game">{t('room.game')}</label>
      <select id="game" className="plain-input" value={gameId} onChange={(event) => setGameId(event.target.value)}>
        {multiGames.map((game) => (
          <option key={game.id} value={game.id}>{gameName(t, game.id, game.name)}</option>
        ))}
      </select>
      <label className="label" htmlFor="room-list">{t('room.list')}</label>
      <select id="room-list" className="plain-input" value={listId} onChange={(event) => setListId(event.target.value)}>
        {lists.map((list) => (
          <option key={list.id} value={list.id}>{list.title}</option>
        ))}
      </select>
      <button type="button" disabled={!listId || pending} onClick={() => void createRoom()}>
        {t('room.create')}
      </button>
      <form className="sheet" onSubmit={(event) => void join(event)}>
        <label className="label" htmlFor="code">{t('room.code')}</label>
        <input id="code" className="ink-input" value={code} maxLength={6} onChange={(event) => setCode(event.target.value.toUpperCase())} />
        <button type="submit" disabled={pending || code.trim().length < 6}>{t('room.join')}</button>
      </form>
      {fault.text ? <p className="error-line" role="alert">{fault.text}</p> : null}
    </>
  )
}

export function RoomTablePage() {
  const { t } = useTranslation()
  const { roomId = '' } = useParams()
  const { profile, refresh } = useAuth()
  const navigate = useNavigate()
  const [room, setRoom] = useState<RoomRow | null>(null)
  const [names, setNames] = useState<{ id: string; name: string }[]>([])
  const [listTitle, setListTitle] = useState('')
  const fault = useFault()
  const [pending, setPending] = useState(false)

  async function load() {
    const { data, error: roomError } = await supabase.from('rooms').select('id, code, host_id, list_id, game_id, status, session_id').eq('id', roomId).maybeSingle()
    if (roomError || !data) {
      fault.local('room.notFound')
      return
    }
    const next = data as RoomRow
    setRoom(next)
    const [{ data: members }, { data: list }] = await Promise.all([
      supabase.from('room_players').select('player_id').eq('room_id', roomId),
      supabase.from('word_lists').select('title').eq('id', next.list_id).maybeSingle(),
    ])
    const ids = (members ?? []).map((row) => String(row.player_id))
    const directory = ids.length ? await supabase.from('profile_directory').select('id, name').in('id', ids) : { data: [] }
    setNames((directory.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) })))
    setListTitle(list ? String(list.title) : '')
    if ((next.status === 'playing' || next.status === 'done') && next.session_id) {
      navigate(`/session/${next.session_id}`)
    }
  }

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), 2000)
    return () => window.clearInterval(id)
  }, [roomId])

  async function start() {
    if (!room) return
    setPending(true)
    fault.clear()
    try {
      const result = await callApi<{ sessionId: string }>({
        action: 'session-start',
        mode: 'multi',
        roomId: room.id,
        gameId: room.game_id,
        listId: room.list_id,
      })
      await refresh()
      navigate(`/session/${result.sessionId}`)
    } catch (caught) {
      fault.caught(caught, 'room.startFailed')
    } finally {
      setPending(false)
    }
  }

  async function leave() {
    try {
      await callApi({ action: 'room-leave', roomId })
      navigate('/room')
    } catch (caught) {
      fault.caught(caught, 'room.leaveFailed')
    }
  }

  if (!room) return <p className="meta">{fault.text || t('room.opening')}</p>
  const game = GAMES.find((item) => item.id === room.game_id)
  const host = profile?.id === room.host_id

  return (
    <>
      <p className="eyebrow">{game ? gameName(t, game.id, game.name) : t('room.fallback')}</p>
      <p className="code-hero">{room.code}</p>
      <p className="meta">{listTitle ? `${t('room.listNamed', { title: listTitle })} ` : ''}{t('room.codeHint')}</p>
      <ul className="contents">
        {names.map((player) => (
          <li key={player.id}>
            <span>{player.name}</span>
            <span className="meta">{player.id === room.host_id ? t('room.host') : t('room.member')}</span>
          </li>
        ))}
      </ul>
      {fault.text ? <p className="error-line" role="alert">{fault.text}</p> : null}
      <div className="row">
        {host ? (
          <button type="button" disabled={names.length < 2 || pending} onClick={() => void start()}>
            {t('room.startAll')}
          </button>
        ) : (
          <p className="meta">{t('room.waitingHost')}</p>
        )}
        <button type="button" className="quiet" onClick={() => void leave()}>{t('room.leave')}</button>
        <Link className="quiet" to="/room">{t('room.another')}</Link>
      </div>
    </>
  )
}
