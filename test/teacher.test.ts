import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TEACHER_LEVELS, scaledCount, teacherBands, teacherDeal, teacherLevel, teacherStake } from '../src/words.ts'

test('a perfect level pays the stake back', () => {
  for (const spec of TEACHER_LEVELS) {
    assert.ok(-spec.entry + spec.words * spec.hit > 0)
    for (let dealt = 1; dealt <= spec.words; dealt += 1) {
      const end = -teacherStake(spec.level, dealt) + dealt * spec.hit
      assert.ok(end > 0, `level ${spec.level} with ${dealt} words ends at ${end}`)
    }
  }
})

test('unknown levels are refused', () => {
  assert.equal(teacherLevel(0), null)
  assert.equal(teacherLevel(1.5), null)
  assert.equal(teacherDeal([{ term: 'cat' }], 0).length, 0)
})

test('longer words sit on higher levels', () => {
  const words = Array.from({ length: 66 }, (_, index) => ({ term: 'w'.repeat(index + 1) }))
  const bands = teacherBands(words)
  assert.equal(bands.length, 6)
  assert.ok(bands.every((band) => band.length === 11))
  const dealt = teacherDeal(words, 1, () => 0)
  assert.equal(dealt.length, 10)
  assert.ok(dealt.every((word) => word.term.length <= 11))
  const hardest = teacherDeal(words, 6, () => 0)
  assert.equal(hardest.length, 11)
  assert.ok(hardest.every((word) => word.term.length >= 56))
})

test('a short list still opens every level', () => {
  const words = [{ term: 'cat' }]
  for (const spec of TEACHER_LEVELS) {
    const dealt = teacherDeal(words, spec.level, () => 0)
    assert.deepEqual(dealt, words)
  }
  assert.equal(scaledCount(20, 5), 5)
  assert.equal(scaledCount(10, 8), 4)
})
