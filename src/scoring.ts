import { ECONOMY } from './config.ts'
import { DomainError } from './errors.ts'
import type { Answer } from './types.ts'

type Economy = typeof ECONOMY

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function speedFactor(timeMs: number, economy: Economy = ECONOMY): number {
  if (!Number.isFinite(timeMs) || timeMs <= 0) return economy.maxSpeed
  return clamp(economy.targetAnswerMs / timeMs, economy.minSpeed, economy.maxSpeed)
}

export function wordScore(
  timesSeen: number,
  answer: Pick<Answer, 'correct' | 'timeMs'>,
  economy: Economy = ECONOMY,
): number {
  if (!answer.correct) return 0
  const familiarity = 1 / (1 + Math.max(0, timesSeen))
  return economy.baseWordPoints * familiarity * speedFactor(answer.timeMs, economy)
}

export function accuracyFactor(errorCount: number, answerCount: number, economy: Economy = ECONOMY): number {
  if (answerCount <= 0) return 0
  const raw = 1 - (errorCount / answerCount) * economy.accuracyPenalty
  return Math.max(economy.accuracyFloor, raw)
}

export function sessionPoints(scores: number[], errorCount: number, economy: Economy = ECONOMY): number {
  const sum = scores.reduce((total, score) => total + score, 0)
  return Math.round(sum * accuracyFactor(errorCount, scores.length, economy))
}

export function applyPlaceMultiplier(
  basePoints: number,
  place: number,
  playerCount: number,
  economy: Economy = ECONOMY,
): { points: number; multiplier: number } {
  if (playerCount < 2) return { points: Math.round(basePoints), multiplier: 1 }
  const min = Math.round(economy.multiMin * 100)
  const step = Math.round(economy.multiStep * 100)
  const hundredths = Math.max(min, min + (playerCount - place) * step)
  return {
    multiplier: hundredths / 100,
    points: Math.round((basePoints * hundredths) / 100),
  }
}

export function convertPoints(points: number, economy: Economy = ECONOMY): { iv: number; xp: number } {
  const ivHundredths = Math.round(economy.ivPerPoint * 100)
  const xpHundredths = Math.round(economy.xpPerPoint * 100)
  return {
    iv: Math.round((points * ivHundredths) / 100),
    xp: Math.round((points * xpHundredths) / 100),
  }
}

export function levelFromXp(xp: number, economy: Economy = ECONOMY): number {
  return 1 + Math.floor(Math.max(0, xp) / economy.xpPerLevel)
}

export function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function gradeTyped(
  words: { id: string; term: string; translation: string }[],
  wordIds: string[],
  raw: { wordId: string; typed: string; timeMs: number }[],
  expect: 'term' | 'translation',
): Answer[] {
  const byId = new Map(words.map((word) => [word.id, word]))
  const answers: Answer[] = raw.map((item) => {
    const word = byId.get(item.wordId)
    if (!word || typeof item.typed !== 'string') {
      throw new DomainError('INVALID_ANSWER', 'В ответе нужно прислать слово и вписанный текст')
    }
    const expected = expect === 'term' ? word.term : word.translation
    const timeMs = Number(item.timeMs)
    return {
      wordId: item.wordId,
      correct: normalizeText(item.typed) === normalizeText(expected),
      timeMs: Number.isFinite(timeMs) && timeMs >= 0 ? Math.min(Math.round(timeMs), 600_000) : 0,
    }
  })
  return normalizeAnswers(wordIds, answers)
}

export function normalizeAnswers(wordIds: string[], answers: Answer[]): Answer[] {
  if (answers.length !== wordIds.length) {
    throw new DomainError('ANSWERS_MISMATCH', 'Число ответов не совпадает со словами упражнения')
  }
  const byId = new Map<string, Answer>()
  for (const answer of answers) {
    if (!wordIds.includes(answer.wordId) || byId.has(answer.wordId)) {
      throw new DomainError('ANSWERS_MISMATCH', 'Ответы должны закрывать каждое слово упражнения один раз')
    }
    if (typeof answer.correct !== 'boolean' || !Number.isFinite(answer.timeMs) || answer.timeMs < 0) {
      throw new DomainError('INVALID_ANSWER', 'У ответа нужны верность и неотрицательное время')
    }
    byId.set(answer.wordId, answer)
  }
  return wordIds.map((wordId) => byId.get(wordId)!)
}
