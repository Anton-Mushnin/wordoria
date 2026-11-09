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
