export type GameMode = 'solo' | 'multi'

export type Word = {
  id: string
  term: string
  translation: string
}

export type WordDraft = {
  term: string
  translation: string
}

export type WordStat = {
  timesSeen: number
  errorCount: number
}

export type Answer = {
  wordId: string
  correct: boolean
  timeMs: number
}

export type GameDefinition = {
  id: string
  name: string
  costIv: number
  modes: GameMode[]
}

export type GameInput = {
  words: Word[]
  stats: { wordId: string; timesSeen: number; errorCount: number }[]
}

export type WordListView = {
  id: string
  title: string
  source: 'server' | 'upload'
  ownerId: string | null
  words: Word[]
}

export type PlayerView = {
  id: string
  name: string
  iv: number
  money: number
  xp: number
  level: number
  subscriptionUntil: string | null
  equippedSkinId: string | null
  skins: { id: string; skinId: string; name: string }[]
  gifts: { id: string; days: number }[]
}

export type LedgerEntry = {
  id: string
  playerId: string
  kind: string
  currency: 'iv' | 'money' | 'xp'
  amount: number
  balanceAfter: number
  refId?: string
  at: string
}

export type Reward =
  | { type: 'skin'; skinId: string; name: string }
  | { type: 'money'; amount: number }
  | { type: 'xp'; amount: number }
  | { type: 'subscription_self'; days: number; until: string }
  | { type: 'subscription_gift'; itemId: string; days: number }

export type SoloStart = {
  sessionId: string
  gameId: string
  chargedIv: number
  free: boolean
  input: GameInput
}

export type SessionReward = {
  sessionId: string
  playerId: string
  place: number
  multiplier: number
  basePoints: number
  points: number
  ivGain: number
  xpGain: number
  errors: number
  level: number
  iv: number
  xp: number
}

export type Placement = {
  playerId: string
  place: number
}
