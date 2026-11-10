import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildMaze,
  cellKey,
  followStroke,
  judgeRelease,
  reaches,
  sealPath,
  type Cell,
  type Rng,
  type StrokeRules,
} from '../src/maze.ts'

function rngFrom(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function openGrid(rows: number, cols: number, walls: Cell[] = []) {
  const open = Array.from({ length: rows }, () => Array<boolean>(cols).fill(true))
  for (const wall of walls) open[wall.row]![wall.col] = false
  return open
}

function rules(open: boolean[][], entrances: Cell[], exits: Cell[], blocked: string[] = []): StrokeRules {
  return { blocked: new Set(blocked), entrances, exits }
}

function route(open: boolean[][], from: Cell, goal: Cell, blocked: ReadonlySet<string>) {
  const start = cellKey(from)
  const prev = new Map<string, string | null>([[start, null]])
  const queue = [from]
  while (queue.length > 0) {
    const cell = queue.shift()!
    if (cell.row === goal.row && cell.col === goal.col) {
      const path: Cell[] = []
      let cursor: string | null = cellKey(goal)
      while (cursor) {
        const [row, col] = cursor.split(',')
        path.push({ row: Number(row), col: Number(col) })
        cursor = prev.get(cursor) ?? null
      }
      return path.reverse()
    }
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const next = { row: cell.row + dr, col: cell.col + dc }
      const key = cellKey(next)
      if (prev.has(key) || blocked.has(key) || !open[next.row]?.[next.col]) continue
      prev.set(key, cellKey(cell))
      queue.push(next)
    }
  }
  return null
}

test('каждый вход лабиринта достигает каждого выхода', () => {
  for (const lanes of [1, 2, 5]) {
    for (let seed = 1; seed <= 12; seed += 1) {
      const maze = buildMaze(lanes, rngFrom(seed))
      assert.equal(maze.rows, lanes * 2 - 1)
      assert.equal(maze.cols, Math.max(7, lanes * 2 + 1))
      assert.equal(maze.entrances.length, lanes)
      assert.equal(maze.exits.length, lanes)
      for (let lane = 0; lane < lanes; lane += 1) {
        assert.deepEqual(maze.entrances[lane], { row: lane * 2, col: 0 })
        assert.deepEqual(maze.exits[lane], { row: lane * 2, col: maze.cols - 1 })
        assert.equal(maze.open[lane * 2]![0], true)
        assert.equal(maze.open[lane * 2]![maze.cols - 1], true)
      }
      for (const entrance of maze.entrances) {
        for (const exit of maze.exits) {
          assert.equal(reaches(maze.open, entrance, exit, new Set()), true)
        }
      }
    }
  }
})

test('лишние проходы добавляют развилки', () => {
  const maze = buildMaze(5, rngFrom(3))
  const nodes = 5 * Math.floor((maze.cols + 1) / 2)
  let passages = 0
  for (const row of maze.open) {
    for (const cell of row) if (cell) passages += 1
  }
  assert.ok(passages > nodes + nodes - 1)
})

test('штрих идёт по свободным клеткам и возвращается назад', () => {
  const entrances = [{ row: 0, col: 0 }]
  const exits = [{ row: 0, col: 4 }]
  const open = openGrid(3, 5, [{ row: 0, col: 2 }])
  const stroke = rules(open, entrances, exits)
  const step = followStroke([{ row: 0, col: 0 }], { row: 0, col: 1 }, open, stroke)
  assert.deepEqual(step, [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ])
  assert.equal(followStroke([{ row: 0, col: 0 }], { row: 2, col: 3 }, open, stroke), null)
  assert.deepEqual(followStroke(step!, { row: 1, col: 2 }, open, stroke), [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 1 },
    { row: 1, col: 2 },
  ])
  assert.equal(followStroke([{ row: 0, col: 0 }], { row: 0, col: 3 }, open, stroke), null)

  const line = followStroke([{ row: 2, col: 0 }], { row: 2, col: 3 }, open, stroke)
  assert.deepEqual(line, [
    { row: 2, col: 0 },
    { row: 2, col: 1 },
    { row: 2, col: 2 },
    { row: 2, col: 3 },
  ])
  assert.deepEqual(followStroke(line!, { row: 2, col: 1 }, open, stroke), [
    { row: 2, col: 0 },
    { row: 2, col: 1 },
  ])
  assert.equal(followStroke([{ row: 0, col: 0 }], { row: 0, col: 1 }, open, rules(open, entrances, exits, ['0,1'])), null)

  const gated = rules(open, [{ row: 0, col: 0 }, { row: 2, col: 0 }], [{ row: 0, col: 4 }, { row: 2, col: 4 }])
  assert.equal(followStroke([{ row: 0, col: 0 }, { row: 1, col: 0 }], { row: 2, col: 0 }, open, gated), null)
  const intoExit = followStroke([{ row: 0, col: 3 }], { row: 0, col: 4 }, open, gated)
  assert.deepEqual(intoExit, [
    { row: 0, col: 3 },
    { row: 0, col: 4 },
  ])
  assert.equal(followStroke(intoExit!, { row: 1, col: 4 }, open, gated), null)
})

test('отпускание в середине отменяет, чужой выход — промах, свой — замок', () => {
  const exits = [
    { row: 0, col: 4 },
    { row: 2, col: 4 },
  ]
  assert.deepEqual(judgeRelease([{ row: 0, col: 0 }], exits, 1), { kind: 'cancel' })
  assert.deepEqual(judgeRelease([{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }], exits, 1), { kind: 'cancel' })
  assert.deepEqual(judgeRelease([{ row: 2, col: 0 }, { row: 2, col: 4 }], exits, 1), { kind: 'lock', exit: 1 })
  assert.deepEqual(judgeRelease([{ row: 0, col: 0 }, { row: 0, col: 4 }], exits, 1), { kind: 'miss', exit: 0 })
})

test('замок не отрезает оставшиеся входы от выходов', () => {
  const entrances = [
    { row: 0, col: 0 },
    { row: 2, col: 0 },
  ]
  const exits = [
    { row: 0, col: 6 },
    { row: 2, col: 6 },
  ]
  const open = openGrid(3, 7)
  const path: Cell[] = [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
    { row: 0, col: 3 },
    { row: 1, col: 3 },
    { row: 2, col: 3 },
    { row: 2, col: 4 },
    { row: 2, col: 5 },
    { row: 2, col: 6 },
  ]
  const sealed = sealPath(open, [], path, entrances, exits, [0], [1])
  assert.equal(reaches(sealed.open, entrances[1]!, exits[0]!, new Set(sealed.locked)), true)
  assert.equal(sealed.locked.includes(cellKey(entrances[0]!)), true)
  assert.equal(sealed.locked.includes(cellKey(exits[1]!)), true)
})

test('замок пробивает стену, если чернила перекрыли единственный мост', () => {
  const entrances = [
    { row: 0, col: 0 },
    { row: 2, col: 0 },
  ]
  const exits = [
    { row: 0, col: 4 },
    { row: 2, col: 4 },
  ]
  const open = openGrid(3, 5, [
    { row: 0, col: 2 },
    { row: 2, col: 2 },
  ])
  const path: Cell[] = [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 1 },
    { row: 1, col: 2 },
    { row: 1, col: 3 },
    { row: 0, col: 3 },
    { row: 0, col: 4 },
  ]
  const sealed = sealPath(open, [], path, entrances, exits, [0], [0])
  assert.equal(sealed.open[2]![2], true)
  assert.equal(sealed.locked.includes('1,2'), true)
  assert.equal(reaches(sealed.open, entrances[1]!, exits[1]!, new Set(sealed.locked)), true)
})

test('после каждого замка оставшиеся ворота всё ещё связаны', () => {
  for (let seed = 1; seed <= 10; seed += 1) {
    const maze = buildMaze(4, rngFrom(seed))
    let open = maze.open
    let locked: string[] = []
    const solved: number[] = []
    for (let lane = 0; lane < maze.entrances.length; lane += 1) {
      const path = route(open, maze.entrances[lane]!, maze.exits[lane]!, new Set(locked))
      assert.ok(path && path.length >= 2)
      const sealed = sealPath(open, locked, path!, maze.entrances, maze.exits, [...solved, lane], [...solved, lane])
      open = sealed.open
      locked = sealed.locked
      solved.push(lane)
      for (let entrance = 0; entrance < maze.entrances.length; entrance += 1) {
        if (solved.includes(entrance)) continue
        for (let exit = 0; exit < maze.exits.length; exit += 1) {
          if (solved.includes(exit)) continue
          assert.equal(reaches(open, maze.entrances[entrance]!, maze.exits[exit]!, new Set(locked)), true)
        }
      }
    }
  }
})
