export const ECONOMY = {
  baseWordPoints: 100,
  minSpeed: 0.5,
  maxSpeed: 2,
  targetAnswerMs: 3000,
  accuracyPenalty: 1,
  accuracyFloor: 0.2,
  ivPerPoint: 0.1,
  xpPerPoint: 1,
  xpPerLevel: 100,
  multiStep: 0.15,
  multiMin: 1.05,
  lootboxWordCount: 5,
  lootboxMaxErrors: 1,
  lootboxMaxTimeMs: 30_000,
  lootboxPriceIv: 50,
  subscriptionDays: 30,
  minSeenForHardness: 2,
  duplicateSkinMoney: 25,
  moneyReward: 100,
  xpReward: 50,
} as const

export const SKINS = [
  { id: 'inkwell', name: 'Чернильница' },
  { id: 'parchment', name: 'Пергамент' },
  { id: 'owl', name: 'Сова' },
  { id: 'compass', name: 'Компас' },
  { id: 'lantern', name: 'Фонарь' },
] as const

export const REWARD_TABLE = [
  { type: 'skin' as const, weight: 40 },
  { type: 'money' as const, weight: 25 },
  { type: 'xp' as const, weight: 20 },
  { type: 'subscription_self' as const, weight: 10 },
  { type: 'subscription_gift' as const, weight: 5 },
]
