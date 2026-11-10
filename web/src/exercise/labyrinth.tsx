import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildMaze,
  cellKey,
  followStroke,
  judgeRelease,
  sealPath,
  type Cell,
  type Maze,
} from '../../../src/maze.ts'
import type { TypedAnswer, WordCard } from './exercises.tsx'
import './labyrinth.css'

const WAVE = 5
const MISS_MS = 280

type Ink = { wordId: string; cells: Cell[] }

type Round = {
  terms: WordCard[]
  translations: WordCard[]
  maze: Maze
  open: boolean[][]
  locked: string[]
  ink: Ink[]
}

type Flash = { termId: string; exit: number }

const ROOM = 3.6
const WALL = 0.58

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

function makeRound(words: WordCard[]): Round {
  const maze = buildMaze(words.length)
  return { terms: shuffle(words), translations: shuffle(words), maze, open: maze.open, locked: [], ink: [] }
}

function axisEdges(count: number) {
  const weights = Array.from({ length: count }, (_, index) => (index % 2 === 0 ? ROOM : WALL))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const edges = [0]
  for (const weight of weights) edges.push(edges[edges.length - 1]! + weight / total)
  return edges
}

function axisIndex(fraction: number, count: number) {
  const edges = axisEdges(count)
  const clamped = Math.min(Math.max(fraction, 0), 0.999999)
  for (let index = 0; index < count; index += 1) {
    if (clamped < edges[index + 1]!) return index
  }
  return count - 1
}

function cellAt(round: Round, node: HTMLElement, x: number, y: number): Cell | null {
  const rect = node.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return null
  if (x < rect.left || y < rect.top || x >= rect.right || y >= rect.bottom) return null
  return {
    row: axisIndex((y - rect.top) / rect.height, round.maze.rows),
    col: axisIndex((x - rect.left) / rect.width, round.maze.cols),
  }
}

function pointedExit(x: number, y: number) {
  const node = document.elementFromPoint(x, y)?.closest('[data-exit]')
  if (!node) return null
  const lane = Number(node.getAttribute('data-exit'))
  return Number.isInteger(lane) ? lane : null
}

function strokeRules(round: Round) {
  return {
    blocked: new Set(round.locked),
    entrances: round.maze.entrances,
    exits: round.maze.exits,
  }
}

function centerOf(cell: Cell, maze: Maze) {
  const rows = axisEdges(maze.rows)
  const cols = axisEdges(maze.cols)
  return {
    x: ((cols[cell.col]! + cols[cell.col + 1]!) / 2) * 100,
    y: ((rows[cell.row]! + rows[cell.row + 1]!) / 2) * 100,
  }
}

function points(cells: Cell[], maze: Maze) {
  return cells.map((cell) => {
    const center = centerOf(cell, maze)
    return `${center.x},${center.y}`
  }).join(' ')
}

function wallFills(open: boolean[][]) {
  const rows = open.length
  const cols = open[0]?.length ?? 0
  const rowEdges = axisEdges(rows)
  const colEdges = axisEdges(cols)
  const fills: { x: number; y: number; width: number; height: number }[] = []
  const bleed = 0.55
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (open[row]?.[col]) continue
      const x = colEdges[col]! * 100
      const y = rowEdges[row]! * 100
      const width = (colEdges[col + 1]! - colEdges[col]!) * 100
      const height = (rowEdges[row + 1]! - rowEdges[row]!) * 100
      fills.push({
        x: Math.max(0, x - bleed),
        y: Math.max(0, y - bleed),
        width: Math.min(100, x + width + bleed) - Math.max(0, x - bleed),
        height: Math.min(100, y + height + bleed) - Math.max(0, y - bleed),
      })
    }
  }
  return fills
}

function wallPaths(open: boolean[][], entrances: readonly Cell[], exits: readonly Cell[]) {
  const rows = open.length
  const cols = open[0]?.length ?? 0
  const rowEdges = axisEdges(rows)
  const colEdges = axisEdges(cols)
  const doors = new Set(entrances.map(cellKey))
  const gates = new Set(exits.map(cellKey))
  const segments: { x1: number; y1: number; x2: number; y2: number }[] = []
  const passable = (row: number, col: number) => row >= 0 && col >= 0 && row < rows && col < cols && Boolean(open[row]?.[col])

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!open[row]?.[col]) continue
      const y1 = rowEdges[row]! * 100
      const y2 = rowEdges[row + 1]! * 100
      const x1 = colEdges[col]! * 100
      const x2 = colEdges[col + 1]! * 100
      const here = cellKey({ row, col })
      if (!passable(row, col - 1) && !(col === 0 && doors.has(here))) segments.push({ x1, y1, x2: x1, y2 })
      if (!passable(row, col + 1) && !(col === cols - 1 && gates.has(here))) segments.push({ x1: x2, y1, x2, y2 })
      if (!passable(row - 1, col)) segments.push({ x1, y1, x2, y2: y1 })
      if (!passable(row + 1, col)) segments.push({ x1, y1: y2, x2, y2 })
    }
  }

  const unused = segments.slice()
  const pointKey = (x: number, y: number) => `${x.toFixed(2)},${y.toFixed(2)}`
  const paths: string[] = []
  while (unused.length > 0) {
    const first = unused.pop()!
    const points = [
      { x: first.x1, y: first.y1 },
      { x: first.x2, y: first.y2 },
    ]
    let grew = true
    while (grew) {
      grew = false
      const head = points[points.length - 1]!
      const tail = points[0]!
      for (let index = 0; index < unused.length; index += 1) {
        const segment = unused[index]!
        const start = pointKey(segment.x1, segment.y1)
        const end = pointKey(segment.x2, segment.y2)
        if (start === pointKey(head.x, head.y)) points.push({ x: segment.x2, y: segment.y2 })
        else if (end === pointKey(head.x, head.y)) points.push({ x: segment.x1, y: segment.y1 })
        else if (start === pointKey(tail.x, tail.y)) points.unshift({ x: segment.x2, y: segment.y2 })
        else if (end === pointKey(tail.x, tail.y)) points.unshift({ x: segment.x1, y: segment.y1 })
        else continue
        unused.splice(index, 1)
        grew = true
        break
      }
    }
    paths.push(points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' '))
  }
  return paths
}

function wordClass(solved: boolean, active: boolean, bad: boolean) {
  return ['labyrinth-word', solved ? 'is-solved' : '', active ? 'is-active' : '', bad ? 'is-bad' : ''].filter(Boolean).join(' ')
}

export function LabyrinthExercise({
  words,
  onSubmit,
  submitting,
}: {
  words: WordCard[]
  onSubmit: (answers: TypedAnswer[]) => void
  submitting: boolean
}) {
  const { t } = useTranslation()
  const [round, setRound] = useState<Round | null>(() => (words.length > 0 ? makeRound(words.slice(0, WAVE)) : null))
  const [stroke, setStroke] = useState<Cell[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [flash, setFlash] = useState<Flash | null>(null)

  const roundRef = useRef(round)
  const strokeRef = useRef<Cell[] | null>(null)
  const activeRef = useRef<string | null>(null)
  const flashRef = useRef<Flash | null>(null)
  const mazeRef = useRef<HTMLDivElement>(null)
  const wordsRef = useRef(words)
  const submitRef = useRef(onSubmit)
  const submittingRef = useRef(submitting)
  const waveRef = useRef(0)
  const sent = useRef(false)
  const missed = useRef(new Set<string>())
  const started = useRef(new Map<string, number>())
  const outcomes = useRef(new Map<string, TypedAnswer>())
  const flashTimer = useRef(0)
  const gesture = useRef({
    move(_x: number, _y: number) {},
    end(_x: number, _y: number) {},
  })

  roundRef.current = round
  wordsRef.current = words
  submitRef.current = onSubmit
  submittingRef.current = submitting

  function showFlash(next: Flash, path: Cell[]) {
    window.clearTimeout(flashTimer.current)
    flashRef.current = next
    setFlash(next)
    setStroke(path)
    flashTimer.current = window.setTimeout(() => {
      flashRef.current = null
      setFlash(null)
      setStroke(null)
    }, MISS_MS)
  }

  function advance() {
    const deck = wordsRef.current
    const start = (waveRef.current + 1) * WAVE
    if (start < deck.length) {
      waveRef.current += 1
      const next = makeRound(deck.slice(start, start + WAVE))
      roundRef.current = next
      setRound(next)
      return
    }
    if (sent.current || outcomes.current.size !== deck.length) return
    sent.current = true
    submitRef.current(deck.map((word) => outcomes.current.get(word.id)!))
  }

  function begin(wordId: string, event: React.PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (submittingRef.current || sent.current || flashRef.current) return
    const current = roundRef.current
    if (!current) return
    const lane = current.terms.findIndex((word) => word.id === wordId)
    if (lane < 0 || current.ink.some((path) => path.wordId === wordId)) return
    if (!started.current.has(wordId)) started.current.set(wordId, Date.now())
    const entrance = current.maze.entrances[lane]!
    activeRef.current = wordId
    strokeRef.current = [entrance]
    setActiveId(wordId)
    setStroke([entrance])
  }

  gesture.current.move = (x, y) => {
    const path = strokeRef.current
    const wordId = activeRef.current
    const current = roundRef.current
    const node = mazeRef.current
    if (!path || !wordId || !current || !node || flashRef.current || submittingRef.current) return
    const cell = cellAt(current, node, x, y)
    if (!cell || cellKey(cell) === cellKey(path[path.length - 1]!)) return
    const next = followStroke(path, cell, current.open, strokeRules(current))
    if (!next) return
    strokeRef.current = next
    setStroke(next)
  }

  gesture.current.end = (x, y) => {
    const path = strokeRef.current
    const wordId = activeRef.current
    const current = roundRef.current
    if (!path || !wordId || !current || submittingRef.current || sent.current) return
    strokeRef.current = null
    activeRef.current = null
    setActiveId(null)
    const lane = current.terms.findIndex((word) => word.id === wordId)
    const correctExit = current.translations.findIndex((word) => word.id === wordId)
    const aimed = pointedExit(x, y)
    const exit = aimed === null ? undefined : current.maze.exits[aimed]
    let drawn = path
    if (exit) {
      const stepped = followStroke(path, exit, current.open, strokeRules(current))
      if (stepped) drawn = stepped
    }
    const verdict = judgeRelease(drawn, current.maze.exits, correctExit)
    if (verdict.kind === 'cancel') {
      setStroke(null)
      return
    }
    if (verdict.kind === 'miss') {
      missed.current.add(wordId)
      showFlash({ termId: wordId, exit: verdict.exit }, drawn)
      return
    }
    const solvedEntrances = current.ink.map((item) => current.terms.findIndex((word) => word.id === item.wordId))
    const solvedExits = current.ink.map((item) => current.translations.findIndex((word) => word.id === item.wordId))
    const sealed = sealPath(
      current.open,
      current.locked,
      drawn,
      current.maze.entrances,
      current.maze.exits,
      [...solvedEntrances, lane],
      [...solvedExits, verdict.exit],
    )
    const word = current.terms[lane]!
    outcomes.current.set(wordId, {
      wordId,
      typed: missed.current.has(wordId) ? '' : word.translation,
      timeMs: Math.min(600_000, Math.max(0, Date.now() - (started.current.get(wordId) ?? Date.now()))),
    })
    const ink = [...current.ink, { wordId, cells: drawn }]
    const next = { ...current, open: sealed.open, locked: sealed.locked, ink }
    roundRef.current = next
    setRound(next)
    setStroke(null)
    if (ink.length === current.terms.length) advance()
  }

  useEffect(() => {
    function onMove(event: PointerEvent) {
      gesture.current.move(event.clientX, event.clientY)
    }
    function onUp(event: PointerEvent) {
      gesture.current.end(event.clientX, event.clientY)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.clearTimeout(flashTimer.current)
    }
  }, [])

  if (!round) return null

  const tracks = Array.from({ length: round.maze.rows }, (_, row) => `${row % 2 === 0 ? ROOM : WALL}rem`).join(' ')
  const masses = wallFills(round.open)
  const walls = wallPaths(round.open, round.maze.entrances, round.maze.exits)
  const head = stroke?.[stroke.length - 1]
  const headCenter = head ? centerOf(head, round.maze) : null

  return (
    <div className="labyrinth">
      <p className="labyrinth-hint">{t('exercise.labyrinth')}</p>
      <div
        className={flash ? 'labyrinth-board is-miss' : 'labyrinth-board'}
        style={{ '--tracks': tracks } as React.CSSProperties}
      >
        {round.terms.map((word, lane) => {
          const solved = round.ink.some((path) => path.wordId === word.id)
          return (
            <button
              key={word.id}
              type="button"
              className={wordClass(solved, activeId === word.id, flash?.termId === word.id)}
              style={{ gridColumn: 1, gridRow: round.maze.entrances[lane]!.row + 1 }}
              title={word.term}
              disabled={solved || submitting}
              aria-pressed={activeId === word.id}
              onPointerDown={(event) => begin(word.id, event)}
            >
              <span>{word.term}</span>
            </button>
          )
        })}
        <div
          ref={mazeRef}
          className="labyrinth-maze"
          onPointerDown={(event) => {
            const cell = cellAt(round, event.currentTarget, event.clientX, event.clientY)
            if (!cell) return
            const lane = round.maze.entrances.findIndex((entrance) => entrance.row === cell.row && entrance.col === cell.col)
            if (lane < 0) return
            begin(round.terms[lane]!.id, event)
          }}
        >
          <svg className={flash ? 'labyrinth-ink is-miss' : 'labyrinth-ink'} viewBox="0 0 100 100" preserveAspectRatio="none">
            {masses.map((mass) => (
              <rect key={`${mass.x}-${mass.y}`} className="labyrinth-mass" x={mass.x} y={mass.y} width={mass.width} height={mass.height} />
            ))}
            {walls.map((path) => (
              <path key={path} className="labyrinth-wall" d={path} />
            ))}
            {round.ink.map((path) => (
              <g key={path.wordId} className="labyrinth-kept">
                <polyline className="nib" points={points(path.cells, round.maze)} />
                <polyline className="core" points={points(path.cells, round.maze)} />
              </g>
            ))}
            {stroke && stroke.length > 1 ? (
              <g className="labyrinth-live">
                <polyline className="nib" points={points(stroke, round.maze)} />
                <polyline className="core" points={points(stroke, round.maze)} />
              </g>
            ) : null}
          </svg>
          {headCenter ? (
            <span className="labyrinth-dot" style={{ left: `${headCenter.x}%`, top: `${headCenter.y}%` }} />
          ) : null}
        </div>
        {round.translations.map((word, lane) => {
          const solved = round.ink.some((path) => path.wordId === word.id)
          return (
            <p
              key={word.id}
              data-exit={lane}
              className={wordClass(solved, false, flash?.exit === lane)}
              style={{ gridColumn: 3, gridRow: round.maze.exits[lane]!.row + 1 }}
              title={word.translation}
            >
              <span>{word.translation}</span>
            </p>
          )
        })}
      </div>
    </div>
  )
}
