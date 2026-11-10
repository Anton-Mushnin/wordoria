export type Cell = { row: number; col: number }

export type Maze = {
  rows: number
  cols: number
  open: boolean[][]
  entrances: Cell[]
  exits: Cell[]
}

export type Rng = () => number

export type StrokeRules = {
  blocked: ReadonlySet<string>
  entrances: readonly Cell[]
  exits: readonly Cell[]
}

export type Release = { kind: 'cancel' } | { kind: 'miss'; exit: number } | { kind: 'lock'; exit: number }

const DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const

export function cellKey(cell: Cell) {
  return `${cell.row},${cell.col}`
}

function same(a: Cell, b: Cell) {
  return a.row === b.row && a.col === b.col
}

function parseCell(key: string): Cell {
  const [row, col] = key.split(',')
  return { row: Number(row), col: Number(col) }
}

function pickIndex(length: number, rng: Rng) {
  return Math.min(length - 1, Math.floor(rng() * length))
}

function shuffle<T>(items: T[], rng: Rng) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = pickIndex(index + 1, rng)
    const current = items[index]!
    items[index] = items[swap]!
    items[swap] = current
  }
}

export function buildMaze(lanes: number, rng: Rng = Math.random): Maze {
  if (!Number.isInteger(lanes) || lanes < 1) throw new Error('Нужна хотя бы одна дорожка')
  const rows = lanes * 2 - 1
  const cols = Math.max(7, lanes * 2 + 1)
  const open = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false))
  const nodeRows = lanes
  const nodeCols = Math.floor((cols + 1) / 2)
  const seen = Array.from({ length: nodeRows }, () => Array<boolean>(nodeCols).fill(false))
  const stack = [{ row: 0, col: 0 }]
  seen[0]![0] = true
  open[0]![0] = true

  while (stack.length > 0) {
    const head = stack[stack.length - 1]!
    const options = DIRS.flatMap(([dr, dc]) => {
      const row = head.row + dr
      const col = head.col + dc
      if (row < 0 || col < 0 || row >= nodeRows || col >= nodeCols || seen[row]![col]) return []
      return [{ row, col, dr, dc }]
    })
    if (options.length === 0) {
      stack.pop()
      continue
    }
    const next = options[pickIndex(options.length, rng)]!
    seen[next.row]![next.col] = true
    open[next.row * 2]![next.col * 2] = true
    open[head.row * 2 + next.dr]![head.col * 2 + next.dc] = true
    stack.push({ row: next.row, col: next.col })
  }

  const doors: Cell[] = []
  for (let row = 0; row < nodeRows; row += 1) {
    for (let col = 0; col < nodeCols; col += 1) {
      if (col + 1 < nodeCols && !open[row * 2]![col * 2 + 1]) doors.push({ row: row * 2, col: col * 2 + 1 })
      if (row + 1 < nodeRows && !open[row * 2 + 1]![col * 2]) doors.push({ row: row * 2 + 1, col: col * 2 })
    }
  }
  shuffle(doors, rng)
  const extra = doors.length === 0 ? 0 : Math.max(1, Math.floor(doors.length * 0.18))
  for (const door of doors.slice(0, extra)) open[door.row]![door.col] = true
  for (let lane = 0; lane < lanes; lane += 1) {
    open[lane * 2]![1] = true
    open[lane * 2]![cols - 2] = true
  }

  const entrances = Array.from({ length: lanes }, (_, lane) => ({ row: lane * 2, col: 0 }))
  const exits = Array.from({ length: lanes }, (_, lane) => ({ row: lane * 2, col: cols - 1 }))
  const restored = sealPath(open, [], [], entrances, exits, [], []).open
  return { rows, cols, open: restored, entrances, exits }
}

export function reaches(open: boolean[][], from: Cell, goal: Cell, blocked: ReadonlySet<string>) {
  if (blocked.has(cellKey(from)) || blocked.has(cellKey(goal))) return false
  if (!open[from.row]?.[from.col] || !open[goal.row]?.[goal.col]) return false
  if (same(from, goal)) return true
  const rows = open.length
  const cols = open[0]?.length ?? 0
  const seen = new Set<string>([cellKey(from)])
  const queue = [from]
  while (queue.length > 0) {
    const cell = queue.shift()!
    for (const [dr, dc] of DIRS) {
      const next = { row: cell.row + dr, col: cell.col + dc }
      if (next.row < 0 || next.col < 0 || next.row >= rows || next.col >= cols) continue
      const key = cellKey(next)
      if (seen.has(key) || blocked.has(key) || !open[next.row]![next.col]) continue
      if (same(next, goal)) return true
      seen.add(key)
      queue.push(next)
    }
  }
  return false
}

function inside(open: boolean[][], cell: Cell) {
  return cell.row >= 0 && cell.col >= 0 && cell.row < open.length && cell.col < (open[0]?.length ?? 0)
}

function append(path: readonly Cell[], steps: Cell[], open: boolean[][], rules: StrokeRules) {
  const next = path.slice()
  const exits = new Set(rules.exits.map(cellKey))
  const entrances = new Set(rules.entrances.map(cellKey))
  const home = cellKey(path[0]!)
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!
    const head = next[next.length - 1]!
    if (Math.abs(head.row - step.row) + Math.abs(head.col - step.col) !== 1) return null
    if (!inside(open, step) || !open[step.row]![step.col]) return null
    const key = cellKey(step)
    if (rules.blocked.has(key) || next.some((cell) => same(cell, step))) return null
    if (entrances.has(key) && key !== home) return null
    if (exits.has(key) && index !== steps.length - 1) return null
    next.push(step)
  }
  return next
}

export function followStroke(path: readonly Cell[], target: Cell, open: boolean[][], rules: StrokeRules) {
  if (path.length === 0 || !inside(open, target)) return null
  const head = path[path.length - 1]!
  const revisit = path.findIndex((cell) => same(cell, target))
  if (revisit >= 0) return revisit === path.length - 1 ? null : path.slice(0, revisit + 1)
  if (rules.exits.some((exit) => same(exit, head))) return null

  if (target.row === head.row || target.col === head.col) {
    const dr = Math.sign(target.row - head.row)
    const dc = Math.sign(target.col - head.col)
    const steps: Cell[] = []
    let row = head.row
    let col = head.col
    while (row !== target.row || col !== target.col) {
      row += dr
      col += dc
      steps.push({ row, col })
    }
    return append(path, steps, open, rules)
  }

  if (Math.abs(target.row - head.row) === 1 && Math.abs(target.col - head.col) === 1) {
    const rowFirst = append(path, [{ row: target.row, col: head.col }, target], open, rules)
    if (rowFirst) return rowFirst
    return append(path, [{ row: head.row, col: target.col }, target], open, rules)
  }
  return null
}

export function judgeRelease(path: readonly Cell[], exits: readonly Cell[], correctExit: number): Release {
  if (path.length < 2) return { kind: 'cancel' }
  const end = path[path.length - 1]!
  const exit = exits.findIndex((cell) => same(cell, end))
  if (exit < 0) return { kind: 'cancel' }
  return exit === correctExit ? { kind: 'lock', exit } : { kind: 'miss', exit }
}

function carve(open: boolean[][], from: Cell, goal: Cell, locked: ReadonlySet<string>, protect: ReadonlySet<string>) {
  const rows = open.length
  const cols = open[0]?.length ?? 0
  const startId = cellKey(from)
  const goalId = cellKey(goal)
  const dist = new Map<string, number>([[startId, 0]])
  const prev = new Map<string, string>()
  const pending = new Set<string>([startId])
  const done = new Set<string>()

  while (pending.size > 0) {
    let bestId = ''
    let bestCost = Number.POSITIVE_INFINITY
    for (const id of pending) {
      const cost = dist.get(id) ?? Number.POSITIVE_INFINITY
      if (cost < bestCost) {
        bestCost = cost
        bestId = id
      }
    }
    pending.delete(bestId)
    if (done.has(bestId)) continue
    done.add(bestId)
    if (bestId === goalId) break
    const cell = parseCell(bestId)
    for (const [dr, dc] of DIRS) {
      const next = { row: cell.row + dr, col: cell.col + dc }
      if (next.row < 0 || next.col < 0 || next.row >= rows || next.col >= cols) continue
      const id = cellKey(next)
      if (protect.has(id) || done.has(id)) continue
      const weight = locked.has(id) ? 2 : open[next.row]![next.col] ? 0 : 1
      const nextCost = bestCost + weight
      if (nextCost < (dist.get(id) ?? Number.POSITIVE_INFINITY)) {
        dist.set(id, nextCost)
        prev.set(id, bestId)
        pending.add(id)
      }
    }
  }

  if (!dist.has(goalId)) return null
  const holes: Cell[] = []
  let cursor = goalId
  while (cursor !== startId) {
    const cell = parseCell(cursor)
    if (locked.has(cursor) || !open[cell.row]![cell.col]) holes.push(cell)
    const parent = prev.get(cursor)
    if (!parent) return null
    cursor = parent
  }
  return holes
}

export function sealPath(
  open: boolean[][],
  lockedKeys: readonly string[],
  path: readonly Cell[],
  entrances: readonly Cell[],
  exits: readonly Cell[],
  solvedEntrances: readonly number[],
  solvedExits: readonly number[],
) {
  const locked = new Set(lockedKeys)
  for (const cell of path) locked.add(cellKey(cell))
  const solvedIn = new Set(solvedEntrances)
  const solvedOut = new Set(solvedExits)
  for (let lane = 0; lane < entrances.length; lane += 1) {
    if (!solvedIn.has(lane)) locked.delete(cellKey(entrances[lane]!))
    if (!solvedOut.has(lane)) locked.delete(cellKey(exits[lane]!))
  }
  const protect = new Set<string>()
  for (const lane of solvedIn) protect.add(cellKey(entrances[lane]!))
  for (const lane of solvedOut) protect.add(cellKey(exits[lane]!))
  const grid = open.map((row) => row.slice())

  for (let guard = 0; guard < entrances.length * exits.length + 2; guard += 1) {
    let carved = false
    for (let entrance = 0; entrance < entrances.length; entrance += 1) {
      if (solvedIn.has(entrance)) continue
      for (let exit = 0; exit < exits.length; exit += 1) {
        if (solvedOut.has(exit)) continue
        if (reaches(grid, entrances[entrance]!, exits[exit]!, locked)) continue
        const holes = carve(grid, entrances[entrance]!, exits[exit]!, locked, protect)
        if (!holes || holes.length === 0) continue
        for (const cell of holes) {
          locked.delete(cellKey(cell))
          grid[cell.row]![cell.col] = true
        }
        carved = true
      }
    }
    if (!carved) break
  }

  return { open: grid, locked: [...locked] }
}
