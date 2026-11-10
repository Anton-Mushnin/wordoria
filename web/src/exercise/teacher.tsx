import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { TEACHER_LEVELS, teacherDeal, teacherLevel, teacherStake } from '../../../src/words.ts'
import type { WordCard } from './exercises.tsx'
import { bustKey, readLevel, readPurse, resetPurse, roundKey, writePurse } from './teacherPurse.ts'
import './teacher.css'

type Round = {
  termIds: string[]
  translationIds: string[]
  solved: string[]
  missed: string[]
  termPick: string | null
  translationPick: string | null
  termCursor: number
  translationCursor: number
  column: 'term' | 'translation'
  purse: number
  done: boolean
  bust: boolean
  closedAt: number | null
  started: number
}

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    const current = copy[index]!
    copy[index] = copy[swap]!
    copy[swap] = current
  }
  return copy
}

function formatPurse(value: number) {
  if (value > 0) return `+${value}`
  return String(value)
}

function sameWords(round: Round, words: WordCard[]) {
  const ids = new Set(words.map((word) => word.id))
  return round.termIds.length === words.length && round.termIds.every((id) => ids.has(id))
}

function openRound(sessionId: string, words: WordCard[], level: number): Round {
  const key = roundKey(sessionId)
  const raw = sessionStorage.getItem(key)
  if (raw) {
    try {
      const saved = JSON.parse(raw) as Round
      if (sameWords(saved, words)) return saved
    } catch {
      /* the saved round is unreadable, so this sitting starts clean */
    }
  }
  const purse = readPurse() - teacherStake(level, words.length)
  writePurse(purse)
  const round: Round = {
    termIds: shuffle(words).map((word) => word.id),
    translationIds: shuffle(words).map((word) => word.id),
    solved: [],
    missed: [],
    termPick: null,
    translationPick: null,
    termCursor: 0,
    translationCursor: 0,
    column: 'term',
    purse,
    done: false,
    bust: false,
    closedAt: null,
    started: Date.now(),
  }
  sessionStorage.setItem(key, JSON.stringify(round))
  return round
}

function leftIds(ids: string[], solved: string[]) {
  return ids.filter((id) => !solved.includes(id))
}

function clampIndex(index: number, length: number) {
  if (length <= 0) return 0
  return Math.min(index, length - 1)
}

export function TeacherDesk({
  words,
  pending,
  onStart,
}: {
  words: { term: string }[]
  pending: boolean
  onStart: (level: number) => void
}) {
  const { t } = useTranslation()
  const [purse, setPurse] = useState(readPurse)
  const known = words.length > 0

  return (
    <section className="crt" aria-label={t('games.teacher')}>
      <div className="crt-status">
        <p className="crt-title">{t('games.teacher')}</p>
        <p className={`crt-purse${purse < 0 ? ' negative' : ''}`} aria-live="polite">
          {t('teacher.purse', { purse: formatPurse(purse) })}
        </p>
      </div>
      {TEACHER_LEVELS.map((spec) => {
        const count = known ? teacherDeal(words, spec.level, () => 0).length : spec.words
        const stake = known ? teacherStake(spec.level, count) : spec.entry
        return (
          <button key={spec.level} type="button" disabled={pending} onClick={() => onStart(spec.level)}>
            {spec.level}{' '}
            {t(known ? 'teacher.rowExact' : 'teacher.row', {
              count,
              words: count,
              stake,
              hit: spec.hit,
              miss: spec.miss,
            })}
          </button>
        )
      })}
      {purse !== 0 ? (
        <button
          type="button"
          className="dos-quiet"
          onClick={() => {
            resetPurse()
            setPurse(0)
          }}
        >
          {t('teacher.newSitting')}
        </button>
      ) : null}
    </section>
  )
}

export function TeacherExercise({
  sessionId,
  words,
  onSubmit,
  submitting,
}: {
  sessionId: string
  words: WordCard[]
  onSubmit: (answers: { wordId: string; typed: string; timeMs: number }[]) => void
  submitting: boolean
}) {
  const { t } = useTranslation()
  const level = readLevel(sessionId)
  const spec = teacherLevel(level) ?? TEACHER_LEVELS[0]!
  const [round, setRound] = useState(() => openRound(sessionId, words, level))
  const [bad, setBad] = useState(false)
  const roundRef = useRef(round)
  const sent = useRef(false)
  const boardRef = useRef<HTMLElement>(null)
  roundRef.current = round

  useEffect(() => {
    sessionStorage.setItem(roundKey(sessionId), JSON.stringify(round))
    writePurse(round.purse)
  }, [round, sessionId])

  useEffect(() => {
    boardRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!bad) return
    const id = window.setTimeout(() => {
      setBad(false)
      setRound((current) => ({ ...current, termPick: null, translationPick: null }))
    }, 280)
    return () => window.clearTimeout(id)
  }, [bad])

  const byId = new Map(words.map((word) => [word.id, word]))
  const terms = leftIds(round.termIds, round.solved)
  const translations = leftIds(round.translationIds, round.solved)
  const termCursor = clampIndex(round.termCursor, terms.length)
  const translationCursor = clampIndex(round.translationCursor, translations.length)

  function commit(next: Round) {
    roundRef.current = next
    setRound(next)
  }

  function choose(side: 'term' | 'translation', id: string) {
    const current = roundRef.current
    if (current.done || bad || submitting) return
    const termIds = leftIds(current.termIds, current.solved)
    const translationIds = leftIds(current.translationIds, current.solved)
    const termPick = side === 'term' ? id : current.termPick
    const translationPick = side === 'translation' ? id : current.translationPick
    const termCursorNext = side === 'term' ? Math.max(0, termIds.indexOf(id)) : current.termCursor
    const translationCursorNext = side === 'translation' ? Math.max(0, translationIds.indexOf(id)) : current.translationCursor
    if (!termPick || !translationPick) {
      commit({
        ...current,
        termPick,
        translationPick,
        termCursor: termCursorNext,
        translationCursor: translationCursorNext,
        column: side === 'term' ? 'translation' : 'term',
      })
      return
    }
    if (termPick === translationPick) {
      const solved = [...current.solved, termPick]
      const done = solved.length === words.length
      let purse = current.purse + spec.hit
      let bust = false
      let closedAt: number | null = null
      if (done && purse < 0) {
        bust = true
        closedAt = purse
        purse = 0
        sessionStorage.setItem(bustKey(sessionId), '1')
      }
      commit({
        ...current,
        solved,
        purse,
        done,
        bust,
        closedAt,
        termPick: null,
        translationPick: null,
        termCursor: 0,
        translationCursor: 0,
        column: 'term',
      })
      return
    }
    commit({
      ...current,
      purse: current.purse - spec.miss,
      missed: current.missed.includes(termPick) ? current.missed : [...current.missed, termPick],
      termPick,
      translationPick,
      termCursor: termCursorNext,
      translationCursor: translationCursorNext,
    })
    setBad(true)
  }

  function move(delta: number) {
    const current = roundRef.current
    if (current.done) return
    if (current.column === 'term') {
      const count = leftIds(current.termIds, current.solved).length
      if (count === 0) return
      commit({ ...current, termCursor: (clampIndex(current.termCursor, count) + delta + count) % count })
      return
    }
    const count = leftIds(current.translationIds, current.solved).length
    if (count === 0) return
    commit({
      ...current,
      translationCursor: (clampIndex(current.translationCursor, count) + delta + count) % count,
    })
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (round.done) return
    if (event.target !== event.currentTarget && event.key === 'Enter') return
    if (event.key === 'ArrowDown') {
      boardRef.current?.focus()
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      commit({ ...roundRef.current, column: event.key === 'ArrowLeft' ? 'term' : 'translation' })
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const current = roundRef.current
      const ids = current.column === 'term' ? leftIds(current.termIds, current.solved) : leftIds(current.translationIds, current.solved)
      const index = clampIndex(current.column === 'term' ? current.termCursor : current.translationCursor, ids.length)
      const id = ids[index]
      if (id) choose(current.column, id)
    }
  }

  function handIn() {
    if (sent.current || submitting) return
    sent.current = true
    const current = roundRef.current
    const timeMs = Math.max(0, Date.now() - current.started)
    onSubmit(
      words.map((word) => ({
        wordId: word.id,
        typed: current.missed.includes(word.id) ? '' : word.translation,
        timeMs,
      })),
    )
  }

  function rowClass(side: 'term' | 'translation', id: string, index: number) {
    const picked = side === 'term' ? round.termPick === id : round.translationPick === id
    const cursor = side === 'term' ? termCursor === index : translationCursor === index
    const wrong = bad && picked
    return [cursor ? 'cursor' : '', picked ? 'picked' : '', wrong ? 'bad' : ''].filter(Boolean).join(' ')
  }

  return (
    <section
      className="crt"
      ref={boardRef}
      tabIndex={0}
      aria-label={t('games.teacher')}
      onKeyDown={onKeyDown}
    >
      <div className="crt-status">
        <p className="crt-title">{t('teacher.levelLine', { level })}</p>
        <p className={`crt-purse${round.purse < 0 ? ' negative' : ''}`} aria-live="polite">
          {t('teacher.purse', { purse: formatPurse(round.purse) })}
        </p>
      </div>
      {round.done ? (
        <div className="crt-end">
          {round.bust ? (
            <>
              <p className="crt-bust">{t('teacher.bankrupt')}</p>
              <p>{t('teacher.bankruptLine', { purse: formatPurse(round.closedAt ?? 0) })}</p>
            </>
          ) : (
            <>
              <p className="crt-clear">{t('teacher.clear')}</p>
              <p>{t('teacher.clearLine', { purse: formatPurse(round.purse) })}</p>
            </>
          )}
          <button type="button" className="dos-go" disabled={submitting} onClick={handIn}>
            {t('teacher.handIn')}
          </button>
        </div>
      ) : (
        <>
          <p className="crt-hint">{t('teacher.hint')}</p>
          <div className="crt-cols">
            <div>
              <p className="crt-head">{t('exercise.word')}</p>
              {terms.map((id, index) => (
                <button
                  key={id}
                  type="button"
                  className={rowClass('term', id, index)}
                  onClick={() => choose('term', id)}
                >
                  {byId.get(id)?.term}
                </button>
              ))}
            </div>
            <div>
              <p className="crt-head">{t('exercise.translation')}</p>
              {translations.map((id, index) => (
                <button
                  key={id}
                  type="button"
                  className={rowClass('translation', id, index)}
                  onClick={() => choose('translation', id)}
                >
                  {byId.get(id)?.translation}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
