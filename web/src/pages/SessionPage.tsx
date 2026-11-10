import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth.tsx'
import { Stamp } from '../components/Marks.tsx'
import { GAMES } from '../domain.ts'
import { GameExercise, type TypedAnswer, type WordCard } from '../exercise/exercises.tsx'
import { bustKey } from '../exercise/teacherPurse.ts'
import { useFault } from '../i18n/fault.ts'
import { placeContext } from '../i18n/index.ts'
import { gameName } from '../i18n/labels.ts'
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
  const { t, i18n } = useTranslation()
  const { sessionId = '' } = useParams()
  const { session, refresh } = useAuth()
  const [phase, setPhase] = useState<Phase>('loading')
  const [gameId, setGameId] = useState('')
  const [words, setWords] = useState<WordCard[]>([])
  const [chargedIv, setChargedIv] = useState(0)
  const [me, setMe] = useState<PlayerRow | null>(null)
  const [board, setBoard] = useState<{ name: string; row: PlayerRow }[]>([])
  const [answers, setAnswers] = useState<AnswerRow[]>([])
  const fault = useFault()
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
          .map((row) => ({ name: names.get(row.player_id) ?? '', row })),
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
    fault.clear()
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
      fault.caught(caught, 'session.answerFailed')
    } finally {
      setPending(false)
    }
  }

  const game = GAMES.find((item) => item.id === gameId)
  const place = me?.place ?? 0
  const bust = gameId === 'teacher' && sessionStorage.getItem(bustKey(sessionId)) === '1'
  if (phase === 'loading') return <p className="meta">{t('session.opening')}</p>
  if (phase === 'missing') return <p className="error-line">{t('session.missing')}</p>

  return (
    <>
      <p className="eyebrow">{game ? gameName(t, game.id, game.name) : t('session.fallback')}</p>
      <p className="meta">{chargedIv === 0 ? t('session.free') : t('session.charged', { iv: chargedIv })}</p>
      {fault.text ? <p className="error-line" role="alert">{fault.text}</p> : null}
      {phase === 'play' ? (
        <GameExercise sessionId={sessionId} gameId={gameId} words={words} onSubmit={(typed) => void submit(typed)} submitting={pending} />
      ) : null}
      {phase === 'waiting' ? (
        <>
          <Stamp tone="ok">{t('session.waitingStamp')}</Stamp>
          <p>{t('session.waiting')}</p>
        </>
      ) : null}
      {phase === 'result' && me ? (
        <>
          <Stamp tone={bust || (me.errors ?? 0) > 0 ? 'bad' : 'ok'}>
            {bust
              ? t('teacher.bustStamp')
              : board.length > 1
                ? t('session.place', { count: place, context: placeContext(place, i18n.language) })
                : t('session.done')}
          </Stamp>
          <p className="word-hero">{me.points ?? 0}</p>
          <p>
            {t('session.pointsWord', { count: me.points ?? 0 })} · {t('session.gains', { iv: me.iv_gain ?? 0, xp: me.xp_gain ?? 0 })}
            {me.multiplier && me.multiplier !== 1 ? ` · ×${me.multiplier}` : ''}
          </p>
          {board.length > 1 ? (
            <ul className="contents">
              {board.map((entry) => (
                <li key={entry.row.player_id}>
                  <span>{entry.row.place}. {entry.name || t('session.player')}</span>
                  <span className="meta">{t('session.boardPoints', { count: entry.row.points ?? 0 })}</span>
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
                  {word.term} — {word.translation} {ok ? t('session.right') : t('session.wrong')}
                </li>
              )
            })}
          </ul>
          <Link className="button" to={gameId === 'teacher' ? '/play/teacher' : '/'}>
            {gameId === 'teacher' ? t('teacher.backToLevels') : t('play.back')}
          </Link>
        </>
      ) : null}
    </>
  )
}
