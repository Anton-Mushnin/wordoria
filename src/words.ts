import type { Word, WordStat } from './types.ts'

export function pickHardestWords(
  words: Word[],
  stats: ReadonlyMap<string, WordStat>,
  count: number,
  minSeen: number,
): Word[] {
  if (count <= 0) return []

  const rows = words.map((word) => ({
    word,
    stat: stats.get(word.id) ?? emptyStat(),
  }))

  const qualified = rows
    .filter((row) => row.stat.timesSeen >= minSeen)
    .sort((a, b) => {
      const rateA = a.stat.errorCount / a.stat.timesSeen
      const rateB = b.stat.errorCount / b.stat.timesSeen
      if (rateB !== rateA) return rateB - rateA
      if (b.stat.timesSeen !== a.stat.timesSeen) return b.stat.timesSeen - a.stat.timesSeen
      return a.word.id.localeCompare(b.word.id)
    })

  const picked: Word[] = []
  const used = new Set<string>()
  for (const row of qualified) {
    if (picked.length >= count) break
    picked.push(row.word)
    used.add(row.word.id)
  }

  if (picked.length < count) {
    const rest = rows
      .filter((row) => !used.has(row.word.id))
      .sort((a, b) => {
        if (a.stat.timesSeen !== b.stat.timesSeen) return a.stat.timesSeen - b.stat.timesSeen
        return a.word.id.localeCompare(b.word.id)
      })
    for (const row of rest) {
      if (picked.length >= count) break
      picked.push(row.word)
    }
  }

  return picked
}

const BRACKETS = ['hard', 'steady', 'fresh'] as const
type Bracket = (typeof BRACKETS)[number]
const BRACKET_SHARES: Record<Bracket, number> = { hard: 5, steady: 4, fresh: 1 }
const RECENT_WINDOW = 3

function emptyStat(): WordStat {
  return { timesSeen: 0, errorCount: 0, recent: [] }
}

export function rememberAttempt(recent: readonly number[] | undefined, correct: boolean): number[] {
  return [...(recent ?? []), correct ? 0 : 1].slice(-RECENT_WINDOW)
}

function bracketOf(stat: WordStat | undefined): Bracket {
  const window = (stat?.recent ?? []).slice(-RECENT_WINDOW)
  if (window.length === 0) return 'fresh'
  const errors = window.reduce((total, mark) => total + (mark > 0 ? 1 : 0), 0)
  return errors / window.length > 1 / 3 ? 'hard' : 'steady'
}

function bracketQuotas(count: number): Record<Bracket, number> {
  const quotas: Record<Bracket, number> = { hard: 0, steady: 0, fresh: 0 }
  let left = count
  const remainders = BRACKETS.map((name) => {
    const floor = Math.floor((count * BRACKET_SHARES[name]) / 10)
    quotas[name] = floor
    left -= floor
    return { name, remainder: (count * BRACKET_SHARES[name]) % 10 }
  })
  remainders.sort((a, b) => b.remainder - a.remainder || BRACKETS.indexOf(a.name) - BRACKETS.indexOf(b.name))
  for (const part of remainders) {
    if (left <= 0) break
    quotas[part.name] += 1
    left -= 1
  }
  return quotas
}

export function pickSessionWords<T extends { id: string }>(
  words: readonly T[],
  stats: ReadonlyMap<string, WordStat>,
  count: number,
  random: () => number = Math.random,
): T[] {
  if (count <= 0 || words.length === 0) return []
  if (words.length <= count) return shuffleDeal(words, random)

  const pools: Record<Bracket, T[]> = { hard: [], steady: [], fresh: [] }
  for (const word of words) pools[bracketOf(stats.get(word.id))].push(word)
  for (const name of BRACKETS) pools[name] = shuffleDeal(pools[name], random)

  const quotas = bracketQuotas(count)
  const picked: T[] = []
  let carry = 0
  for (const name of BRACKETS) {
    const need = quotas[name] + carry
    const take = pools[name].splice(0, need)
    picked.push(...take)
    carry = need - take.length
  }
  if (carry > 0) {
    for (const name of ['steady', 'hard'] as const) {
      const take = pools[name].splice(0, carry)
      picked.push(...take)
      carry -= take.length
      if (carry <= 0) break
    }
  }
  return shuffleDeal(picked, random)
}

export type TeacherLevel = {
  level: number
  words: number
  entry: number
  hit: number
  miss: number
}

export const TEACHER_LEVELS: readonly TeacherLevel[] = [
  { level: 1, words: 10, entry: 10, hit: 2, miss: 1 },
  { level: 2, words: 12, entry: 16, hit: 2, miss: 1 },
  { level: 3, words: 14, entry: 24, hit: 3, miss: 2 },
  { level: 4, words: 16, entry: 32, hit: 3, miss: 2 },
  { level: 5, words: 18, entry: 42, hit: 4, miss: 2 },
  { level: 6, words: 20, entry: 50, hit: 4, miss: 3 },
]

const TEACHER_BANDS = TEACHER_LEVELS.length

export function teacherLevel(level: number): TeacherLevel | null {
  if (!Number.isInteger(level)) return null
  return TEACHER_LEVELS.find((item) => item.level === level) ?? null
}

export function teacherBands<T extends { term: string }>(words: readonly T[]): T[][] {
  const sorted = [...words].sort((a, b) => a.term.length - b.term.length || a.term.localeCompare(b.term))
  const bands: T[][] = Array.from({ length: TEACHER_BANDS }, () => [])
  if (sorted.length === 0) return bands
  sorted.forEach((word, index) => {
    const band = Math.min(TEACHER_BANDS - 1, Math.floor((index * TEACHER_BANDS) / sorted.length))
    bands[band]!.push(word)
  })
  return bands
}

export function scaledCount(target: number, available: number): number {
  if (available <= 0) return 0
  return Math.max(1, Math.min(available, Math.round((target * available) / 20)))
}

function shuffleDeal<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    const current = copy[index]!
    copy[index] = copy[swap]!
    copy[swap] = current
  }
  return copy
}

export function teacherStake(level: number, dealt: number): number {
  const spec = teacherLevel(level)
  if (!spec || dealt <= 0) return 0
  if (dealt >= spec.words) return spec.entry
  return Math.max(1, Math.round((spec.entry * dealt) / spec.words))
}

export function teacherDeal<T extends { term: string }>(
  words: readonly T[],
  level: number,
  random: () => number = Math.random,
): T[] {
  const spec = teacherLevel(level)
  if (!spec || words.length === 0) return []
  const band = teacherBands(words)[level - 1] ?? []
  const pool = band.length > 0 ? band : words
  const limit = band.length > 0 ? spec.words : scaledCount(spec.words, words.length)
  return shuffleDeal(pool, random).slice(0, Math.min(pool.length, limit))
}
