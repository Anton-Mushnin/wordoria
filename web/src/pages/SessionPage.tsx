import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth.tsx'
import { Stamp } from '../components/Marks.tsx'
import { GAMES } from '../domain.ts'
import { GameExercise, type TypedAnswer, type WordCard } from '../exercise/exercises.tsx'
import { ApiError, callApi } from '../lib/api.ts'
import { supabase } from '../lib/supabase.ts'
import { asIds } from '../lib/words.ts'

type Phase = 'loading' | 'play' | 'waiting' | 'result' | 'missing'

type PlayerRow = {
  player_id: string
  charged_iv: number
  finished: boolean
  place: number | null
  points: number | null
  multiplier: number | null
  iv_gain: number | null
  xp_gain: number | null
  base_points: number | null
  errors: number | null
}

type AnswerRow = { word_id: string; correct: boolean; time_ms: number }

export function SessionPage() {
  const { sessionId = '' } = useParams()
  const { session, refresh } = useAuth()
  const [phase, setPhase] = useState<Phase>('loading')
  const [gameId, setGameId] = useState('')
  const [words, setWords] = useState<WordCard[]>([])
  const [chargedIv, setChargedIv] = useState(0)
  const [me, setMe] = useState<PlayerRow | null>(null)
  const [board, setBoard] = useState<{ name: string; row: PlayerRow }[]>([])
  const [answers, setAnswers] = useState<AnswerRow[]>([])
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    if (!session) return
    const { data: sessionRow, error: sessionError } = await supabase
      .from('sessions')
      .select('id, mode, game_id, word_ids, status')
      .eq('id', sessionId)
      .maybeSingle()
    if (sessionError || !sessionRow) {
      setPhase('missing')
      return
    }
    const ids = asIds(sessionRow.word_ids)
    const [{ data: wordRows }, { data: playerRows }, { data: answerRows }] = await Promise.all([
      supabase.from('words').select('id, term, translation').in('id', ids),
      supabase.from('session_players').select('player_id, charged_iv, finished, place, points, multiplier, iv_gain, xp_gain, base_points, errors').eq('session_id', sessionId),
      supabase.from('session_answers').select('word_id, correct, time_ms').eq('session_id', sessionId),
    ])
    const order = new Map(ids.map((id, index) => [id, index]))
    const cards = ((wordRows ?? []) as WordCard[]).slice().sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    const players = (playerRows ?? []) as PlayerRow[]
    const mine = players.find((row) => row.player_id === session.user.id) ?? null
    setGameId(String(sessionRow.game_id))
    setWords(cards)
    setChargedIv(mine?.charged_iv ?? 0)
    setMe(mine)
    setAnswers((answerRows ?? []) as AnswerRow[])
    if (sessionRow.status === 'finished') {
      const directory = await supabase.from('profile_directory').select('id, name').in(
        'id',
        players.map((row) => row.player_id),
      )
      const names = new Map((directory.data ?? []).map((row) => [String(row.id), String(row.name)]))
      setBoard(
        players
          .slice()
          .sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
          .map((row) => ({ name: names.get(row.player_id) ?? 'Игрок', row })),
      )
      setPhase('result')
      return
    }
    setPhase(mine?.finished ? 'waiting' : 'play')
  }, [session, sessionId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (phase !== 'waiting') return
    const id = window.setInterval(() => void load(), 2000)
    return () => window.clearInterval(id)
  }, [phase, load])

  async function submit(typed: TypedAnswer[]) {
    const sentKey = `wordoria-sent:${sessionId}`
    if (sessionStorage.getItem(sentKey)) return
    sessionStorage.setItem(sentKey, '1')
    setPending(true)
    setError('')
    try {
      await callApi({ action: 'session-finish', sessionId, answers: typed })
      await refresh()
      await load()
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'SESSION_CLOSED') {
        await load()
        return
      }
      sessionStorage.removeItem(sentKey)
      setError(caught instanceof ApiError ? caught.message : 'Ответ не принят')
    } finally {
      setPending(false)
    }
  }

  const game = GAMES.find((item) => item.id === gameId)
  if (phase === 'loading') return <p className="meta">Открываю упражнение…</p>
  if (phase === 'missing') return <p className="error-line">Упражнение не найдено.</p>

  return (
    <>
      <p className="eyebrow">{game?.name ?? 'Упражнение'}</p>
      <p className="meta">{chargedIv === 0 ? 'Бесплатно' : `Списано ${chargedIv} ИВ`}</p>
      {error ? <p className="error-line" role="alert">{error}</p> : null}
      {phase === 'play' ? (
        <GameExercise sessionId={sessionId} gameId={gameId} words={words} onSubmit={(typed) => void submit(typed)} submitting={pending} />
      ) : null}
      {phase === 'waiting' ? (
        <>
          <Stamp tone="ok">Ждём</Stamp>
          <p>Ответы записаны. Ждём, пока закончат остальные.</p>
        </>
      ) : null}
      {phase === 'result' && me ? (
        <>
          <Stamp tone={(me.errors ?? 0) === 0 ? 'ok' : 'bad'}>
            {board.length > 1 ? `${me.place} место` : 'Готово'}
          </Stamp>
          <p className="word-hero">{me.points ?? 0}</p>
          <p>
            баллов · +{me.iv_gain ?? 0} ИВ · +{me.xp_gain ?? 0} к уровню
            {me.multiplier && me.multiplier !== 1 ? ` · ×${me.multiplier}` : ''}
          </p>
          {board.length > 1 ? (
            <ul className="contents">
              {board.map((entry) => (
                <li key={entry.row.player_id}>
                  <span>{entry.row.place}. {entry.name}</span>
                  <span className="meta">{entry.row.points} баллов</span>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="marks">
            {words.map((word) => {
              const answer = answers.find((item) => item.word_id === word.id)
              const ok = answer?.correct
              return (
                <li key={word.id} className={ok ? 'mark-ok' : 'mark-bad'}>
                  {word.term} — {word.translation} {ok ? 'верно' : 'мимо'}
                </li>
              )
            })}
          </ul>
          <Link className="button" to="/">На стол</Link>
        </>
      ) : null}
    </>
  )
}
