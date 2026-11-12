import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PenLine } from '../components/Marks.tsx'
import { InvadersExercise } from './invaders.tsx'
import { TeacherExercise } from './teacher.tsx'
import { LabyrinthExercise } from './labyrinth.tsx'
import { NeonExercise } from './neon.tsx'

export type WordCard = { id: string; term: string; translation: string }
export type TypedAnswer = { wordId: string; typed: string; timeMs: number }

type LineProps = {
  sessionId: string
  words: WordCard[]
  prompt: 'term' | 'translation'
  totalMs?: number
  perWordMs?: number
  onSubmit: (answers: TypedAnswer[]) => void
  submitting: boolean
}

type Draft = {
  answers: TypedAnswer[]
  index: number
  shownAt: number
  deadline: number | null
  value: string
}

const draftKey = (sessionId: string) => `wordoria-draft:${sessionId}`

function readDraft(sessionId: string, totalMs?: number): Draft {
  try {
    const raw = sessionStorage.getItem(draftKey(sessionId))
    if (raw) return JSON.parse(raw) as Draft
  } catch {
    /* start a fresh line */
  }
  return {
    answers: [],
    index: 0,
    shownAt: Date.now(),
    deadline: totalMs ? Date.now() + totalMs : null,
    value: '',
  }
}

export function LineExercise({ sessionId, words, prompt, totalMs, perWordMs, onSubmit, submitting }: LineProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(() => readDraft(sessionId, totalMs))
  const [now, setNow] = useState(Date.now())
  const draftRef = useRef(draft)
  const locked = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef(onSubmit)
  const wordsRef = useRef(words)
  draftRef.current = draft
  submitRef.current = onSubmit
  wordsRef.current = words

  useEffect(() => {
    sessionStorage.setItem(draftKey(sessionId), JSON.stringify(draft))
  }, [draft, sessionId])

  useEffect(() => {
    inputRef.current?.focus()
  }, [draft.index])

  function finish(answers: TypedAnswer[]) {
    if (locked.current) return
    locked.current = true
    sessionStorage.removeItem(draftKey(sessionId))
    submitRef.current(answers)
  }

  function elapsed(current: Draft) {
    const spent = Math.max(0, Date.now() - current.shownAt)
    return Math.min(600_000, perWordMs ? Math.min(perWordMs, spent) : spent)
  }

  function advance(typed: string) {
    const current = draftRef.current
    const deck = wordsRef.current
    const word = deck[current.index]
    if (!word || locked.current) return
    const answers = [...current.answers, { wordId: word.id, typed, timeMs: elapsed(current) }]
    if (current.index + 1 >= deck.length) {
      finish(answers)
      return
    }
    const next = { ...current, answers, index: current.index + 1, shownAt: Date.now(), value: '' }
    draftRef.current = next
    setDraft(next)
  }

  function rest(typedForCurrent: string) {
    const current = draftRef.current
    const deck = wordsRef.current
    const answers = [...current.answers]
    for (let index = current.index; index < deck.length; index += 1) {
      const word = deck[index]
      if (!word) continue
      answers.push({
        wordId: word.id,
        typed: index === current.index ? typedForCurrent : '',
        timeMs: index === current.index ? elapsed(current) : 0,
      })
    }
    return answers
  }

  useEffect(() => {
    const id = window.setInterval(() => {
      const tick = Date.now()
      setNow(tick)
      const current = draftRef.current
      if (locked.current || current.index >= wordsRef.current.length) return
      if (current.deadline !== null && tick >= current.deadline) {
        finish(rest(current.value))
        return
      }
      if (perWordMs !== undefined && tick - current.shownAt >= perWordMs) advance(current.value)
    }, 200)
    return () => window.clearInterval(id)
  }, [perWordMs, sessionId])

  const word = words[draft.index]
  if (!word) return <p className="meta">{t('exercise.handingIn')}</p>
  const hero = prompt === 'term' ? word.term : word.translation
  const progress = perWordMs
    ? Math.max(0, perWordMs - (now - draft.shownAt)) / perWordMs
    : draft.deadline && totalMs
      ? Math.max(0, draft.deadline - now) / totalMs
      : 1

  return (
    <form
      className="sheet"
      onSubmit={(event) => {
        event.preventDefault()
        advance(draft.value)
      }}
    >
      <p className="meta">
        {t('exercise.progress', { current: draft.index + 1, total: words.length })}
      </p>
      <h2 className="word-hero">{hero}</h2>
      <PenLine progress={progress} />
      <label className="label" htmlFor="answer">
        {prompt === 'term' ? t('exercise.translation') : t('exercise.word')}
      </label>
      <input
        id="answer"
        ref={inputRef}
        className="ink-input"
        value={draft.value}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))}
      />
      <div className="row">
        <button type="submit" disabled={submitting}>
          {draft.index + 1 === words.length ? t('exercise.handIn') : t('exercise.next')}
        </button>
        <button type="button" className="quiet" disabled={submitting} onClick={() => advance('')}>
          {t('exercise.skip')}
        </button>
        <button type="button" className="quiet" disabled={submitting} onClick={() => finish(rest(''))}>
          {t('exercise.giveUp')}
        </button>
      </div>
    </form>
  )
}

function shuffle<T>(items: T[]) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    const current = copy[index]!
    copy[index] = copy[swap]!
    copy[swap] = current
  }
  return copy
}

export function PairsExercise({
  words,
  onSubmit,
  submitting,
}: {
  words: WordCard[]
  onSubmit: (answers: TypedAnswer[]) => void
  submitting: boolean
}) {
  const { t } = useTranslation()
  const [terms] = useState(() => shuffle(words))
  const [translations] = useState(() => shuffle(words))
  const [termId, setTermId] = useState<string | null>(null)
  const [translationId, setTranslationId] = useState<string | null>(null)
  const [solved, setSolved] = useState<Record<string, { timeMs: number; correct: boolean }>>({})
  const [missed, setMissed] = useState<string[]>([])
  const [bad, setBad] = useState(false)
  const started = useRef(Date.now())
  const sent = useRef(false)

  function choose(side: 'term' | 'translation', id: string) {
    if (solved[id] || submitting) return
    const nextTerm = side === 'term' ? id : termId
    const nextTranslation = side === 'translation' ? id : translationId
    if (side === 'term') setTermId(id)
    else setTranslationId(id)
    if (!nextTerm || !nextTranslation) return
    if (nextTerm === nextTranslation) {
      const nextSolved = {
        ...solved,
        [nextTerm]: { timeMs: Date.now() - started.current, correct: !missed.includes(nextTerm) },
      }
      setSolved(nextSolved)
      setTermId(null)
      setTranslationId(null)
      if (Object.keys(nextSolved).length === words.length && !sent.current) {
        sent.current = true
        onSubmit(
          words.map((word) => ({
            wordId: word.id,
            typed: nextSolved[word.id]?.correct ? word.translation : '',
            timeMs: nextSolved[word.id]?.timeMs ?? 0,
          })),
        )
      }
      return
    }
    setMissed((current) => (current.includes(nextTerm) ? current : [...current, nextTerm]))
    setBad(true)
    window.setTimeout(() => {
      setBad(false)
      setTermId(null)
      setTranslationId(null)
    }, 280)
  }

  return (
    <div className="sheet">
      <p className="meta">{t('exercise.match')}</p>
      <div className="pair-grid">
        <div>
          {terms.map((word) => (
            <button
              key={word.id}
              type="button"
              className={tileClass(Boolean(solved[word.id]), termId === word.id, bad && termId === word.id)}
              onClick={() => choose('term', word.id)}
              disabled={Boolean(solved[word.id])}
            >
              {word.term}
            </button>
          ))}
        </div>
        <div>
          {translations.map((word) => (
            <button
              key={word.id}
              type="button"
              className={tileClass(Boolean(solved[word.id]), translationId === word.id, bad && translationId === word.id)}
              onClick={() => choose('translation', word.id)}
              disabled={Boolean(solved[word.id])}
            >
              {word.translation}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function tileClass(done: boolean, selected: boolean, wrong: boolean) {
  return ['tile', done ? 'solved' : '', selected ? 'selected' : '', wrong ? 'bad' : ''].filter(Boolean).join(' ')
}

export function GameExercise({
  sessionId,
  gameId,
  words,
  onSubmit,
  submitting,
}: {
  sessionId: string
  gameId: string
  words: WordCard[]
  onSubmit: (answers: TypedAnswer[]) => void
  submitting: boolean
}) {
  if (gameId === 'pairs') return <PairsExercise words={words} onSubmit={onSubmit} submitting={submitting} />
  if (gameId === 'invaders') return <InvadersExercise words={words} onSubmit={onSubmit} submitting={submitting} />
  if (gameId === 'teacher') {
    return <TeacherExercise sessionId={sessionId} words={words} onSubmit={onSubmit} submitting={submitting} />
  }
  if (gameId === 'labyrinth') return <LabyrinthExercise words={words} onSubmit={onSubmit} submitting={submitting} />
  if (gameId === 'neon') return <NeonExercise words={words} onSubmit={onSubmit} submitting={submitting} />
  return (
    <LineExercise
      sessionId={sessionId}
      words={words}
      prompt={gameId === 'dictation' ? 'translation' : 'term'}
      totalMs={gameId === 'sprint' ? 60_000 : undefined}
      perWordMs={gameId === 'blitz' ? 5_000 : undefined}
      onSubmit={onSubmit}
      submitting={submitting}
    />
  )
}
