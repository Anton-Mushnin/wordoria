import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ECONOMY } from '../src/config.ts'
import {
  applyPlaceMultiplier,
  convertPoints,
  levelFromXp,
  gradeTyped,
  sessionPoints,
  speedFactor,
  wordScore,
} from '../src/scoring.ts'

const target = ECONOMY.targetAnswerMs

test('новое слово на целевой скорости даёт базовые баллы', () => {
  const score = wordScore(0, { correct: true, timeMs: target })
  assert.equal(score, ECONOMY.baseWordPoints)
  assert.equal(sessionPoints([score], 0), 100)
  assert.deepEqual(convertPoints(100), { iv: 10, xp: 100 })
})

test('повтор слова уменьшает баллы', () => {
  assert.equal(wordScore(1, { correct: true, timeMs: target }), 50)
  assert.equal(wordScore(3, { correct: true, timeMs: target }), 25)
})

test('скорость ограничена сверху и снизу', () => {
  assert.equal(speedFactor(target / 2), ECONOMY.maxSpeed)
  assert.equal(wordScore(0, { correct: true, timeMs: target / 2 }), 200)
  assert.equal(speedFactor(target * 4), ECONOMY.minSpeed)
  assert.equal(wordScore(0, { correct: true, timeMs: target * 4 }), 50)
})

test('ошибка обнуляет слово и режет сумму сессии', () => {
  const scores = [
    wordScore(0, { correct: true, timeMs: target }),
    wordScore(0, { correct: false, timeMs: target }),
  ]
  assert.deepEqual(scores, [100, 0])
  assert.equal(sessionPoints(scores, 1), 50)
})

test('множитель места не опускается ниже 1.05 и растёт к первому', () => {
  assert.deepEqual(applyPlaceMultiplier(100, 1, 4), { points: 150, multiplier: 1.5 })
  assert.deepEqual(applyPlaceMultiplier(100, 2, 4), { points: 135, multiplier: 1.35 })
  assert.deepEqual(applyPlaceMultiplier(100, 3, 4), { points: 120, multiplier: 1.2 })
  assert.deepEqual(applyPlaceMultiplier(100, 4, 4), { points: 105, multiplier: 1.05 })
  assert.equal(applyPlaceMultiplier(100, 8, 8).multiplier, 1.05)
  assert.equal(applyPlaceMultiplier(100, 1, 1).multiplier, 1)
})

test('сервер сверяет вписанный текст', () => {
  const words = [{ id: '1', term: 'cat', translation: 'кот' }]
  const correct = gradeTyped(words, ['1'], [{ wordId: '1', typed: ' Кот ', timeMs: 3000 }], 'translation')
  assert.equal(correct[0]?.correct, true)
  const wrong = gradeTyped(words, ['1'], [{ wordId: '1', typed: 'пёс', timeMs: 3000 }], 'translation')
  assert.equal(wrong[0]?.correct, false)
  const dictated = gradeTyped(words, ['1'], [{ wordId: '1', typed: 'CAT', timeMs: 1000 }], 'term')
  assert.equal(dictated[0]?.correct, true)
})

test('уровень растёт пачками очков', () => {
  assert.equal(levelFromXp(0), 1)
  assert.equal(levelFromXp(99), 1)
  assert.equal(levelFromXp(100), 2)
})
