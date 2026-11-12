import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Word, WordStat } from '../src/types.ts'
import { pickHardestWords, pickSessionWords, rememberAttempt } from '../src/words.ts'

function word(id: string): Word {
  return { id, term: id, translation: id }
}

test('сначала слова с высокой долей ошибок, потом малознакомые', () => {
  const words = ['fish', 'cat', 'dog', 'bird', 'tree'].map(word)
  const stats = new Map<string, WordStat>([
    ['fish', { timesSeen: 2, errorCount: 2, recent: [] }],
    ['cat', { timesSeen: 4, errorCount: 3, recent: [] }],
    ['dog', { timesSeen: 4, errorCount: 1, recent: [] }],
    ['bird', { timesSeen: 1, errorCount: 1, recent: [] }],
  ])
  const picked = pickHardestWords(words, stats, 5, 2).map((item) => item.id)
  assert.deepEqual(picked, ['fish', 'cat', 'dog', 'tree', 'bird'])
})

function ids(dealt: { id: string }[]) {
  return dealt.map((item) => item.id)
}

const keep = () => 0.999999

function stat(recent: number[], timesSeen = recent.length, errorCount = recent.reduce((sum, mark) => sum + mark, 0)): WordStat {
  return { timesSeen, errorCount, recent }
}

test('окно попыток хранит три последних исхода', () => {
  assert.deepEqual(rememberAttempt(undefined, false), [1])
  assert.deepEqual(rememberAttempt([0, 1, 0], true), [1, 0, 0])
  assert.deepEqual(rememberAttempt([1, 1, 0], false), [1, 0, 1])
})

test('колода на 10 слов: 5 трудных, 4 устойчивых, 1 новое', () => {
  const words = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 's1', 's2', 's3', 's4', 's5', 'u1', 'u2'].map(word)
  const stats = new Map<string, WordStat>([
    ['h1', stat([1])],
    ['h2', stat([1, 0])],
    ['h3', stat([1, 1, 0])],
    ['h4', stat([1, 1])],
    ['h5', stat([1, 1, 1])],
    ['h6', stat([1, 0, 1])],
    ['s1', stat([0])],
    ['s2', stat([0, 0])],
    ['s3', stat([1, 0, 0])],
    ['s4', stat([0, 0, 0], 10, 10)],
    ['s5', stat([0, 1, 0])],
    ['u1', stat([])],
  ])
  assert.deepEqual(ids(pickSessionWords(words, stats, 10, keep)), [
    'h1', 'h2', 'h3', 'h4', 'h5',
    's1', 's2', 's3', 's4',
    'u1',
  ])
})

test('нехватка трудных добирается из устойчивых', () => {
  const words = ['h1', 'h2', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 'u1', 'u2'].map(word)
  const stats = new Map<string, WordStat>([
    ['h1', stat([1, 1, 1])],
    ['h2', stat([1, 1])],
    ['s1', stat([0, 0, 0])],
    ['s2', stat([0, 0, 0])],
    ['s3', stat([0, 0, 0])],
    ['s4', stat([0, 0, 0])],
    ['s5', stat([0, 0, 0])],
    ['s6', stat([0, 0, 0])],
    ['s7', stat([0, 0, 0])],
    ['s8', stat([0, 0, 0])],
    ['u1', stat([])],
  ])
  assert.deepEqual(ids(pickSessionWords(words, stats, 10, keep)), [
    'h1', 'h2',
    's1', 's2', 's3', 's4', 's5', 's6', 's7',
    'u1',
  ])
})

test('нехватка устойчивых добирается из новых', () => {
  const words = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 's1', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map(word)
  const stats = new Map<string, WordStat>([
    ['h1', stat([1])],
    ['h2', stat([1])],
    ['h3', stat([1])],
    ['h4', stat([1])],
    ['h5', stat([1])],
    ['h6', stat([1])],
    ['s1', stat([0, 0, 1])],
    ['u1', stat([])],
    ['u2', stat([])],
    ['u3', stat([])],
    ['u4', stat([])],
    ['u5', stat([])],
  ])
  assert.deepEqual(ids(pickSessionWords(words, stats, 10, keep)), [
    'h1', 'h2', 'h3', 'h4', 'h5',
    's1',
    'u1', 'u2', 'u3', 'u4',
  ])
})

test('пустое новое добирается из устойчивых', () => {
  const words = ['h1', 'h2', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'].map(word)
  const stats = new Map<string, WordStat>([
    ['h1', stat([1, 1])],
    ['h2', stat([1, 0, 1])],
    ...['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'].map((id) => [id, stat([0, 0, 0])] as const),
  ])
  assert.deepEqual(ids(pickSessionWords(words, stats, 10, keep)), [
    'h1', 'h2',
    's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8',
  ])
})

test('если легче нечего взять, добираем из трудных', () => {
  const words = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10', 'h11'].map(word)
  const stats = new Map<string, WordStat>(words.map((item) => [item.id, stat([1, 1, 1])]))
  assert.deepEqual(ids(pickSessionWords(words, stats, 10, keep)), [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10',
  ])
})

test('квоты других размеров сохраняют долю 5:4:1', () => {
  const words = [
    ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8'],
    ...['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'],
    ...['u1', 'u2', 'u3'],
  ].map(word)
  const stats = new Map<string, WordStat>([
    ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8'].map((id) => [id, stat([1, 1])] as const),
    ...['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map((id) => [id, stat([0, 0])] as const),
  ])
  assert.deepEqual(ids(pickSessionWords(words, stats, 8, keep)), ['h1', 'h2', 'h3', 'h4', 's1', 's2', 's3', 'u1'])
  assert.deepEqual(ids(pickSessionWords(words, stats, 12, keep)), [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    's1', 's2', 's3', 's4', 's5',
    'u1',
  ])
  assert.deepEqual(ids(pickSessionWords(words, stats, 5, keep)), ['h1', 'h2', 'h3', 's1', 's2'])
})

test('короткий список уходит в игру целиком', () => {
  const words = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(word)
  const dealt = pickSessionWords(words, new Map(), 10, keep)
  assert.equal(dealt.length, 8)
  assert.deepEqual(ids(dealt), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
})
