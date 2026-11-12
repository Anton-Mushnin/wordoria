import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TypedAnswer, WordCard } from './exercises.tsx'
import './neon.css'

const KEYS = ['q', 'w', 'e', 'a', 's', 'd', 'z', 'x', 'c']
const FIRST_MS = 3600
const LAST_MS = 2600
const HIT_MS = 140
const FLASH_MS = 420
const GAP_MS = 380
const WRONG_NOTES = 2

type Verdict = 'hit' | 'miss' | null

type Flyer = {
  cell: number
  text: string
  correct: boolean
}

type Note = {
  index: number
  flyers: Flyer[]
  startedAt: number
  duration: number
  verdict: Verdict
}

type Point = { x: number; y: number }

function prefersStill() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function approachMs(index: number, total: number) {
  if (total <= 1) return FIRST_MS
  return Math.round(FIRST_MS + ((LAST_MS - FIRST_MS) * index) / (total - 1))
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

function sameText(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

function pickCells(count: number, previous: number) {
  const pool = shuffle(KEYS.map((_, index) => index).filter((index) => index !== previous))
  const cells = pool.slice(0, count)
  if (cells.length < count && previous >= 0) cells.push(previous)
  return cells
}

function makeNote(index: number, deck: WordCard[], previous: number): Note {
  const word = deck[index]
  const taken = new Set<string>()
  if (word) taken.add(word.translation.trim().toLowerCase())
  const wrongs = shuffle(deck.filter((item) => item.id !== word?.id)).filter((item) => {
    const key = item.translation.trim().toLowerCase()
    if (taken.has(key) || sameText(item.translation, word?.translation ?? '')) return false
    taken.add(key)
    return true
  }).slice(0, WRONG_NOTES)
  const cells = pickCells(1 + wrongs.length, previous)
  const flyers = shuffle<Flyer>([
    { cell: cells[0] ?? 0, text: word?.translation ?? '', correct: true },
    ...wrongs.map((item, slot) => ({ cell: cells[slot + 1] ?? slot, text: item.translation, correct: false })),
  ])
  return {
    index,
    flyers,
    startedAt: performance.now(),
    duration: approachMs(index, deck.length),
    verdict: null,
  }
}

function pose(progress: number, from: Point, to: Point) {
  const along = 0.34 + 0.66 * Math.min(1, Math.max(0, progress))
  return {
    x: from.x + (to.x - from.x) * along,
    y: from.y + (to.y - from.y) * along,
    scale: 0.92 + 0.08 * Math.min(1, Math.max(0, progress)),
    opacity: 0.82 + 0.18 * along,
    glow: along,
  }
}

function spanMs(duration: number) {
  return duration + HIT_MS + GAP_MS
}

function place(note: Note, now: number) {
  const span = spanMs(note.duration)
  const elapsed = Math.max(0, now - note.startedAt)
  const step = Math.floor(elapsed / span)
  const local = elapsed - step * span
  return { step, local, live: local <= note.duration + HIT_MS }
}

export function NeonExercise({
  words,
  onSubmit,
  submitting,
}: {
  words: WordCard[]
  onSubmit: (answers: TypedAnswer[]) => void
  submitting: boolean
}) {
  const { t } = useTranslation()
  const [note, setNote] = useState(() => makeNote(0, words, -1))
  const [step, setStep] = useState(0)
  const [showing, setShowing] = useState(true)
  const [still, setStill] = useState(prefersStill)

  const noteRef = useRef(note)
  const stepRef = useRef(0)
  const showingRef = useRef(true)
  const wordsRef = useRef(words)
  const submitRef = useRef(onSubmit)
  const submittingRef = useRef(submitting)
  const stillRef = useRef(still)
  const outcomes = useRef(new Map<string, TypedAnswer>())
  const locked = useRef(false)
  const sent = useRef(false)
  const mounted = useRef(true)
  const timers = useRef<number[]>([])
  const stageRef = useRef<HTMLDivElement>(null)
  const flyRefs = useRef<(HTMLDivElement | null)[]>([])
  const ringRefs = useRef<(HTMLSpanElement | null)[]>([])
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([])
  const hoveredRef = useRef<number | null>(null)
  const judgeRef = useRef<(kind: 'hit' | 'miss', timeMs: number) => void>(() => {})
  const drawRef = useRef<(progress: number, frozen: boolean) => void>(() => {})

  noteRef.current = note
  wordsRef.current = words
  submitRef.current = onSubmit
  submittingRef.current = submitting
  stillRef.current = still

  function draw(progress: number, frozen: boolean) {
    const stage = stageRef.current
    const current = noteRef.current
    if (!stage) return
    const stageBox = stage.getBoundingClientRect()
    const from = { x: stageBox.width / 2, y: 0 }
    const flyer = current.flyers[stepRef.current]
    if (!flyer || (!showingRef.current && !frozen)) return
    const button = cellRefs.current[flyer.cell]
    const fly = flyRefs.current[flyer.cell]
    if (!button || !fly) return
    const cellBox = button.getBoundingClientRect()
    const to = {
      x: cellBox.left + cellBox.width / 2 - stageBox.left,
      y: cellBox.top + cellBox.height / 2 - stageBox.top,
    }
    if (frozen) return
    const at = pose(stillRef.current ? 1 : progress, from, to)
    const size = Math.max(88, Math.min(cellBox.width, cellBox.height) * 0.84)
    fly.style.width = `${size}px`
    fly.style.opacity = String(at.opacity)
    fly.style.setProperty('--glow', String(at.glow))
    fly.style.setProperty('--x', `${at.x}px`)
    fly.style.setProperty('--y', `${at.y}px`)
    fly.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -50%) scale(${at.scale})`
    const ring = ringRefs.current[flyer.cell]
    if (ring && stillRef.current) {
      ring.style.opacity = '1'
      ring.style.width = `${Math.min(cellBox.width, cellBox.height) * 0.72}px`
      ring.style.height = `${Math.min(cellBox.width, cellBox.height) * 0.72}px`
      ring.style.transform = `translate(${to.x}px, ${to.y}px) translate(-50%, -50%)`
      ring.style.setProperty('--left', String(Math.max(0, Math.min(1, 1 - progress))))
    }
  }

  function judge(kind: 'hit' | 'miss', timeMs: number) {
    if (locked.current || sent.current || submittingRef.current) return
    const current = noteRef.current
    const word = wordsRef.current[current.index]
    if (!word || current.verdict) return
    locked.current = true
    const judged: Note = { ...current, verdict: kind }
    noteRef.current = judged
    outcomes.current.set(word.id, {
      wordId: word.id,
      typed: kind === 'hit' ? word.translation : '',
      timeMs: Math.min(600_000, Math.max(0, Math.round(timeMs))),
    })
    setNote(judged)
    const index = current.index
    const cell = current.flyers[stepRef.current]?.cell ?? 0
    const id = window.setTimeout(() => {
      if (!mounted.current) return
      const deck = wordsRef.current
      if (index + 1 >= deck.length) {
        if (sent.current) return
        sent.current = true
        submitRef.current(
          deck.map((item) => outcomes.current.get(item.id) ?? { wordId: item.id, typed: '', timeMs: 0 }),
        )
        return
      }
      const created = makeNote(index + 1, deck, cell)
      locked.current = false
      stepRef.current = 0
      showingRef.current = true
      noteRef.current = created
      setStep(0)
      setShowing(true)
      setNote(created)
    }, FLASH_MS)
    timers.current.push(id)
  }

  function reveal(active: number) {
    if (stepRef.current === active && showingRef.current) return
    stepRef.current = active
    showingRef.current = true
    setStep(active)
    setShowing(true)
  }

  judgeRef.current = judge
  drawRef.current = draw

  useLayoutEffect(() => {
    const current = noteRef.current
    if (current.verdict || !showingRef.current) return
    const { local } = place(current, performance.now())
    draw(local / current.duration, false)
  }, [note.index, note.verdict, step, showing, still])

  useEffect(() => {
    mounted.current = true
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMotion = () => setStill(media.matches)
    media.addEventListener('change', onMotion)

    let frame = 0
    let alive = true
    const tick = (now: number) => {
      if (!alive) return
      frame = window.requestAnimationFrame(tick)
      const current = noteRef.current
      const word = wordsRef.current[current.index]
      if (!word || current.verdict || locked.current) {
        const { local } = place(current, now)
        drawRef.current(local / current.duration, true)
        return
      }
      const { step: active, local, live } = place(current, now)
      const flyer = current.flyers[active]
      if (!flyer) {
        judgeRef.current('miss', local)
        return
      }
      if (!live) {
        if (flyer.correct) {
          judgeRef.current('miss', local)
          return
        }
        if (showingRef.current) {
          showingRef.current = false
          setShowing(false)
        }
        return
      }
      reveal(active)
      if (Math.abs(local - current.duration) <= HIT_MS && hoveredRef.current === flyer.cell) {
        judgeRef.current(flyer.correct ? 'hit' : 'miss', local)
        return
      }
      drawRef.current(local / current.duration, false)
    }
    frame = window.requestAnimationFrame(tick)

    const stage = stageRef.current
    const observer = stage
      ? new ResizeObserver(() => {
          const current = noteRef.current
          const { local } = place(current, performance.now())
          drawRef.current(local / current.duration, current.verdict !== null)
        })
      : null
    if (stage && observer) observer.observe(stage)

    return () => {
      alive = false
      mounted.current = false
      media.removeEventListener('change', onMotion)
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      for (const id of timers.current) window.clearTimeout(id)
      timers.current = []
    }
  }, [])

  const word = words[note.index]
  if (!word) return <p className="meta">{t('exercise.handingIn')}</p>
  const active = showing ? note.flyers[step] : undefined

  return (
    <div className={still ? 'neon is-still' : 'neon'} data-state={showing ? (note.verdict ?? 'approach') : 'gap'} data-cell={active?.cell ?? -1}>
      <h2 className="neon-term" aria-live="polite">
        {word.term}
      </h2>
      <p className="neon-progress">{t('exercise.progress', { current: note.index + 1, total: words.length })}</p>
      <div className="neon-stage" ref={stageRef}>
        {active ? (
          <div
            key={active.cell}
            ref={(node) => {
              flyRefs.current[active.cell] = node
            }}
            className={['neon-note', note.verdict === 'hit' ? 'is-hit' : '', note.verdict === 'miss' ? 'is-miss' : '']
              .filter(Boolean)
              .join(' ')}
            aria-hidden="true"
          >
            {active.text}
          </div>
        ) : null}
        {still && active && note.verdict === null ? (
          <span
            ref={(node) => {
              ringRefs.current[active.cell] = node
            }}
            className="neon-ring"
            aria-hidden="true"
          />
        ) : null}
        <div className="neon-grid">
          {KEYS.map((key, index) => (
            <button
              key={key}
              type="button"
              ref={(node) => {
                cellRefs.current[index] = node
              }}
              className={['neon-cell', index === active?.cell && note.verdict === 'hit' ? 'is-hit' : ''].filter(Boolean).join(' ')}
              aria-disabled={submitting || note.verdict !== null}
              onPointerEnter={() => {
                hoveredRef.current = index
              }}
              onPointerLeave={() => {
                if (hoveredRef.current === index) hoveredRef.current = null
              }}
            >
              <span className="neon-key">{key}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="neon-hint">{t('exercise.neon')}</p>
    </div>
  )
}
