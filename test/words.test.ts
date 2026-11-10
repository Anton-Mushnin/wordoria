import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Word, WordStat } from '../src/types.ts'
import { pickHardestWords, pickSessionWords } from '../src/words.ts'

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

function ids(dealt: { id: string }[]) {
  return dealt.map((item) => item.id).sort()
}

function ratedDeck() {
  const words = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'].map(word)
  const stats = new Map<string, WordStat>([
    ['a', { timesSeen: 10, errorCount: 0 }],
    ['b', { timesSeen: 1, errorCount: 0 }],
    ['c', { timesSeen: 3, errorCount: 0 }],
    ['d', { timesSeen: 2, errorCount: 0 }],
    ['e', { timesSeen: 4, errorCount: 0 }],
    ['f', { timesSeen: 5, errorCount: 0 }],
    ['g', { timesSeen: 4, errorCount: 1 }],
    ['h', { timesSeen: 4, errorCount: 2 }],
    ['i', { timesSeen: 4, errorCount: 3 }],
    ['j', { timesSeen: 2, errorCount: 2 }],
    ['k', { timesSeen: 4, errorCount: 4 }],
    ['l', { timesSeen: 10, errorCount: 10 }],
  ])
  return { words, stats }
}

test('колода делится пополам между редкими лёгкими и самыми трудными', () => {
  const { words, stats } = ratedDeck()
  const still = () => 0
  assert.deepEqual(ids(pickSessionWords(words, stats, 10, still)), ['b', 'c', 'd', 'e', 'f', 'h', 'i', 'j', 'k', 'l'])
  assert.deepEqual(ids(pickSessionWords(words, stats, 6, still)), ['b', 'c', 'd', 'j', 'k', 'l'])
  assert.deepEqual(ids(pickSessionWords(words, stats, 5, still)), ['b', 'c', 'd', 'k', 'l'])
})

test('короткий список уходит в игру целиком', () => {
  const words = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(word)
  const dealt = pickSessionWords(words, new Map(), 10, () => 0)
  assert.equal(dealt.length, 8)
  assert.deepEqual(ids(dealt), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
})

test('невстреченное слово считается лёгким и берётся первым', () => {
  const words = ['old', 'new', 'mid', 'bad', 'worse'].map(word)
  const stats = new Map<string, WordStat>([
    ['old', { timesSeen: 8, errorCount: 0 }],
    ['mid', { timesSeen: 4, errorCount: 1 }],
    ['bad', { timesSeen: 4, errorCount: 4 }],
    ['worse', { timesSeen: 6, errorCount: 6 }],
  ])
  const dealt = ids(pickSessionWords(words, stats, 4, () => 0))
  assert.deepEqual(dealt, ['bad', 'mid', 'new', 'worse'])
})
