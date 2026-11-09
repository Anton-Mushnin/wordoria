import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Word, WordStat } from '../src/types.ts'
import { pickHardestWords } from '../src/words.ts'

function word(id: string): Word {
  return { id, term: id, translation: id }
}

test('сначала слова с высокой долей ошибок, потом малознакомые', () => {
  const words = ['fish', 'cat', 'dog', 'bird', 'tree'].map(word)
  const stats = new Map<string, WordStat>([
    ['fish', { timesSeen: 2, errorCount: 2 }],
    ['cat', { timesSeen: 4, errorCount: 3 }],
    ['dog', { timesSeen: 4, errorCount: 1 }],
    ['bird', { timesSeen: 1, errorCount: 1 }],
  ])
  const picked = pickHardestWords(words, stats, 5, 2).map((item) => item.id)
  assert.deepEqual(picked, ['fish', 'cat', 'dog', 'tree', 'bird'])
})
