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
    stat: stats.get(word.id) ?? { timesSeen: 0, errorCount: 0 },
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
