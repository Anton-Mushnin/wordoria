export { ECONOMY, REWARD_TABLE, SKINS } from './config.ts'
export { DomainError } from './errors.ts'
export type { DomainErrorCode } from './errors.ts'
export { GAMES } from './games.ts'
export {
  accuracyFactor,
  applyPlaceMultiplier,
  convertPoints,
  gradeTyped,
  levelFromXp,
  normalizeText,
  sessionPoints,
  speedFactor,
  wordScore,
} from './scoring.ts'
export type {
  Answer,
  GameDefinition,
  GameInput,
  GameMode,
  LedgerEntry,
  Placement,
  PlayerView,
  Reward,
  SessionReward,
  SoloStart,
  Word,
  WordDraft,
  WordListView,
  WordStat,
} from './types.ts'
export { pickHardestWords, pickSessionWords, teacherDeal, teacherLevel, teacherStake, TEACHER_LEVELS } from './words.ts'
export { Wordoria } from './wordoria.ts'
export type { WordoriaOptions } from './wordoria.ts'
