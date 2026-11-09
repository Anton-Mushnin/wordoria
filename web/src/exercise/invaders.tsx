import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TypedAnswer, WordCard } from './exercises.tsx'
import './invaders.css'

const WAVE = 6
const FIRST_FALL_MS = 16_000
const MIN_FALL_MS = 8_000
const SHOT_MS = 520
const BURST_MS = 460
const TOP = 0.18
const GAP = 0.22
const VISIBLE = 0.04

type Status = 'falling' | 'firing' | 'burst' | 'wreck' | 'crashed'

type Piece = {
  id: string
  lane: number
  y: number
  status: Status
  enteredAt: number | null
}

type Bolt = { id: string; x1: number; y1: number; x2: number; y2: number }

type Overlay = { width: number; height: number; bolts: Bolt[] }

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

function fallMs(wave: number) {
  return Math.max(MIN_FALL_MS, FIRST_FALL_MS * 0.88 ** wave)
}

function reduceMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function spawn(deck: WordCard[], now: number): Piece[] {
  return deck.map((word, lane) => {
    const y = TOP - GAP * lane
    return {
      id: word.id,
      lane,
      y,
      status: 'falling' as const,
      enteredAt: y >= VISIBLE ? now : null,
    }
  })
}

function elapsed(piece: Piece, now: number) {
  const start = piece.enteredAt ?? now
  return Math.min(600_000, Math.max(0, Math.round(now - start)))
}

function shipClass(selected: boolean, wrong: boolean, status: Status) {
  return [
    'invaders-ship',
    selected && !wrong ? 'is-selected' : '',
    wrong && selected ? 'is-bad' : '',
    status === 'falling' ? 'is-falling' : '',
    status === 'firing' ? 'is-firing' : '',
    status === 'burst' ? 'is-burst' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function gunClass(selected: boolean, wrong: boolean, status: Status | undefined) {
  return [
    'invaders-gun',
    selected && !wrong ? 'is-selected' : '',
    wrong && selected ? 'is-bad' : '',
    status === 'firing' || status === 'burst' ? 'is-firing' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function InvadersExercise({
  words,
  onSubmit,
  submitting,
}: {
  words: WordCard[]
  onSubmit: (answers: TypedAnswer[]) => void
  submitting: boolean
}) {
  const { t } = useTranslation()
  const [pieces, setPieces] = useState(() => spawn(words.slice(0, WAVE), performance.now()))
  const [guns, setGuns] = useState(() => shuffle(words.slice(0, WAVE)))
  const [termId, setTermId] = useState<string | null>(null)
  const [gunId, setGunId] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  const [overlay, setOverlay] = useState<Overlay | null>(null)

  const piecesRef = useRef(pieces)
  const wordsRef = useRef(words)
  const submitRef = useRef(onSubmit)
  const submittingRef = useRef(submitting)
  const termRef = useRef<string | null>(null)
  const gunRef = useRef<string | null>(null)
  const badRef = useRef(false)
  const waveRef = useRef(0)
  const outcomes = useRef(new Map<string, TypedAnswer>())
  const sent = useRef(false)
  const timers = useRef<number[]>([])
  const fieldRef = useRef<HTMLDivElement>(null)
  const gunRefs = useRef(new Map<string, HTMLButtonElement>())
  const wordRefs = useRef(new Map<string, HTMLButtonElement>())

  wordsRef.current = words
  submitRef.current = onSubmit
  submittingRef.current = submitting

  function setTerm(id: string | null) {
    termRef.current = id
    setTermId(id)
  }

  function setGun(id: string | null) {
    gunRef.current = id
    setGunId(id)
  }

  function setBadFlag(value: boolean) {
    badRef.current = value
    setBad(value)
  }

  function later(ms: number, fn: () => void) {
    const id = window.setTimeout(() => {
      fn()
    }, ms)
    timers.current.push(id)
  }

  function apply(recipe: (current: Piece[]) => Piece[]) {
    const next = recipe(piecesRef.current)
    piecesRef.current = next
    setPieces(next)
    return next
  }

  function record(answer: TypedAnswer) {
    if (outcomes.current.has(answer.wordId)) return
    outcomes.current.set(answer.wordId, answer)
  }

  function advance(current: Piece[]) {
    if (current.some((piece) => piece.status === 'falling' || piece.status === 'firing' || piece.status === 'burst')) return
    const deck = wordsRef.current
    if (deck.length === 0) return
    const start = (waveRef.current + 1) * WAVE
    if (start < deck.length) {
      waveRef.current += 1
      const slice = deck.slice(start, start + WAVE)
      const spawned = spawn(slice, performance.now())
      piecesRef.current = spawned
      setPieces(spawned)
      setGuns(shuffle(slice))
      setTerm(null)
      setGun(null)
      setBadFlag(false)
      return
    }
    if (sent.current || outcomes.current.size !== deck.length) return
    sent.current = true
    submitRef.current(deck.map((word) => outcomes.current.get(word.id)!))
  }

  function fire(id: string) {
    const now = performance.now()
    const piece = piecesRef.current.find((item) => item.id === id)
    const word = wordsRef.current.find((item) => item.id === id)
    if (!piece || !word || piece.status !== 'falling' || piece.y >= 1) return
    record({ wordId: id, typed: word.translation, timeMs: elapsed(piece, now) })
    if (reduceMotion()) {
      advance(apply((current) => current.map((item) => (item.id === id ? { ...item, status: 'wreck' } : item))))
      return
    }
    apply((current) => current.map((item) => (item.id === id ? { ...item, status: 'firing' } : item)))
    later(SHOT_MS, () => {
      apply((current) => current.map((item) => (item.id === id && item.status === 'firing' ? { ...item, status: 'burst' } : item)))
      later(BURST_MS, () => {
        advance(apply((current) => current.map((item) => (item.id === id && item.status === 'burst' ? { ...item, status: 'wreck' } : item))))
      })
    })
  }

  function resolve(term: string, gun: string) {
    if (term !== gun) {
      setBadFlag(true)
      later(280, () => {
        setBadFlag(false)
        if (termRef.current === term) setTerm(null)
        if (gunRef.current === gun) setGun(null)
      })
      return
    }
    const piece = piecesRef.current.find((item) => item.id === term)
    setTerm(null)
    setGun(null)
    if (!piece || piece.status !== 'falling' || piece.y >= 1) return
    fire(term)
  }

  function choose(side: 'term' | 'gun', id: string) {
    if (submittingRef.current || badRef.current || sent.current) return
    const piece = piecesRef.current.find((item) => item.id === id)
    if (!piece || piece.status !== 'falling') return
    if (side === 'term' && (piece.y < VISIBLE || piece.y >= 1)) return
    if (side === 'term') {
      if (termRef.current === id) {
        setTerm(null)
        return
      }
      setTerm(id)
      if (gunRef.current) resolve(id, gunRef.current)
      return
    }
    if (gunRef.current === id) {
      setGun(null)
      return
    }
    setGun(id)
    if (termRef.current) resolve(termRef.current, id)
  }

  useEffect(() => {
    const linkId = 'invaders-silkscreen'
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link')
      link.id = linkId
      link.rel = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap'
      document.head.appendChild(link)
    }
    return () => {
      for (const id of timers.current) window.clearTimeout(id)
    }
  }, [])

  useEffect(() => {
    let frame = 0
    let active = true
    let last = performance.now()
    const tick = (now: number) => {
      if (!active) return
      frame = window.requestAnimationFrame(tick)
      const dt = Math.min(50, now - last)
      last = now
      const speed = dt / fallMs(waveRef.current)
      let moved = false
      const next = piecesRef.current.map((piece) => {
        if (piece.status !== 'falling') return piece
        const y = piece.y + speed
        let enteredAt = piece.enteredAt
        if (enteredAt === null && y >= VISIBLE) enteredAt = now
        if (y >= 1) {
          moved = true
          record({ wordId: piece.id, typed: '', timeMs: elapsed({ ...piece, enteredAt }, now) })
          if (termRef.current === piece.id) setTerm(null)
          if (gunRef.current === piece.id) setGun(null)
          return { ...piece, y: 1, status: 'crashed' as const, enteredAt }
        }
        if (y !== piece.y || enteredAt !== piece.enteredAt) moved = true
        return { ...piece, y, enteredAt }
      })
      if (!moved) return
      piecesRef.current = next
      setPieces(next)
      advance(next)
    }
    frame = window.requestAnimationFrame(tick)
    return () => {
      active = false
      window.cancelAnimationFrame(frame)
    }
  }, [])

  const firingKey = pieces
    .filter((piece) => piece.status === 'firing')
    .map((piece) => piece.id)
    .join(',')

  useLayoutEffect(() => {
    if (!firingKey) {
      setOverlay(null)
      return
    }
    const field = fieldRef.current
    if (!field) return
    const frame = field.getBoundingClientRect()
    const bolts = firingKey.split(',').flatMap((id) => {
      const gun = gunRefs.current.get(id)
      const word = wordRefs.current.get(id)
      if (!gun || !word) return []
      const gunBox = gun.getBoundingClientRect()
      const wordBox = word.getBoundingClientRect()
      return [
        {
          id,
          x1: gunBox.left + gunBox.width / 2 - frame.left,
          y1: gunBox.top - frame.top,
          x2: wordBox.left + wordBox.width / 2 - frame.left,
          y2: wordBox.top + wordBox.height / 2 - frame.top,
        },
      ]
    })
    setOverlay({ width: frame.width, height: frame.height, bolts })
  }, [firingKey])

  const byId = new Map(words.map((word) => [word.id, word]))
  const lanes = Math.max(pieces.length, 1)
  const bursting = pieces.some((piece) => piece.status === 'burst')

  return (
    <div className="invaders">
      <div className={bursting ? 'invaders-field is-shaking' : 'invaders-field'} ref={fieldRef}>
        <p className="invaders-hint">{t('exercise.invaders')}</p>
        <div className="invaders-sky" style={{ '--lanes': String(lanes) } as React.CSSProperties}>
          {pieces.map((piece) => {
            const left = `${((piece.lane + 0.5) / lanes) * 100}%`
            if (piece.status === 'crashed') {
              return <span key={piece.id} className="invaders-crash" style={{ left }} aria-hidden="true" />
            }
            if (piece.status === 'wreck') return null
            if (piece.status === 'falling' && piece.y < VISIBLE) return null
            const word = byId.get(piece.id)
            if (!word) return null
            return (
              <button
                key={piece.id}
                type="button"
                data-status={piece.status}
                ref={(node) => {
                  if (node) wordRefs.current.set(piece.id, node)
                  else wordRefs.current.delete(piece.id)
                }}
                className={shipClass(termId === piece.id, bad, piece.status)}
                style={{ left, top: `${piece.y * 100}%`, '--bob': String(piece.lane) } as React.CSSProperties}
                disabled={submitting || piece.status !== 'falling'}
                aria-pressed={termId === piece.id}
                onClick={() => choose('term', piece.id)}
              >
                <span className="invaders-body">
                  <span className="invaders-antenna" aria-hidden="true" />
                  <span className="invaders-word">{word.term}</span>
                  <span className="invaders-legs" aria-hidden="true" />
                </span>
                {piece.status === 'burst' ? (
                  <span className="invaders-shards" aria-hidden="true">
                    <span /><span /><span /><span /><span /><span />
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        <div className="invaders-guns">
          {guns.map((word) => {
            const piece = pieces.find((item) => item.id === word.id)
            return (
              <div className="invaders-slot" key={word.id} data-status={piece?.status ?? 'falling'}>
                <button
                  type="button"
                  ref={(node) => {
                    if (node) gunRefs.current.set(word.id, node)
                    else gunRefs.current.delete(word.id)
                  }}
                  className={gunClass(gunId === word.id, bad, piece?.status)}
                  disabled={submitting || piece?.status !== 'falling'}
                  aria-pressed={gunId === word.id}
                  onClick={() => choose('gun', word.id)}
                >
                  <span className="invaders-barrel" aria-hidden="true" />
                  <span className="invaders-label">{word.translation}</span>
                </button>
                <div className="invaders-bay">
                  {piece?.status === 'wreck' ? <span className="invaders-wreck">{word.term}</span> : null}
                </div>
              </div>
            )
          })}
        </div>
        {overlay && overlay.bolts.length > 0 ? (
          <svg className="invaders-bolt" viewBox={`0 0 ${overlay.width} ${overlay.height}`} aria-hidden="true">
            {overlay.bolts.map((bolt) => (
              <g key={bolt.id}>
                <line className="invaders-glow" pathLength={1} x1={bolt.x1} y1={bolt.y1} x2={bolt.x2} y2={bolt.y2} />
                <line className="invaders-tracer" pathLength={1} x1={bolt.x1} y1={bolt.y1} x2={bolt.x2} y2={bolt.y2} />
              </g>
            ))}
          </svg>
        ) : null}
      </div>
    </div>
  )
}
