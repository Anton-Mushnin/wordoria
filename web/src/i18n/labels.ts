import type { TFunction } from 'i18next'

const games = {
  flashcards: 'games.flashcards',
  sprint: 'games.sprint',
  dictation: 'games.dictation',
  pairs: 'games.pairs',
  blitz: 'games.blitz',
  invaders: 'games.invaders',
  labyrinth: 'games.labyrinth',
  teacher: 'games.teacher',
} as const

const skins = {
  inkwell: 'skins.inkwell',
  parchment: 'skins.parchment',
  owl: 'skins.owl',
  compass: 'skins.compass',
  lantern: 'skins.lantern',
} as const

const ledger = {
  exercise_fee: 'ledger.exercise_fee',
  exercise_reward: 'ledger.exercise_reward',
  exercise_xp: 'ledger.exercise_xp',
  transfer_out: 'ledger.transfer_out',
  transfer_in: 'ledger.transfer_in',
  lootbox_purchase: 'ledger.lootbox_purchase',
  lootbox_money: 'ledger.lootbox_money',
  lootbox_xp: 'ledger.lootbox_xp',
} as const

const errors = {
  UNKNOWN_ACTION: 'errors.UNKNOWN_ACTION',
  INVALID_TITLE: 'errors.INVALID_TITLE',
  INVALID_WORD: 'errors.INVALID_WORD',
  EMPTY_LIST: 'errors.EMPTY_LIST',
  PLAYER_NOT_FOUND: 'errors.PLAYER_NOT_FOUND',
  LIST_NOT_FOUND: 'errors.LIST_NOT_FOUND',
  LIST_FORBIDDEN: 'errors.LIST_FORBIDDEN',
  GAME_NOT_FOUND: 'errors.GAME_NOT_FOUND',
  MODE_UNSUPPORTED: 'errors.MODE_UNSUPPORTED',
  NEED_OPPONENTS: 'errors.NEED_OPPONENTS',
  SESSION_NOT_FOUND: 'errors.SESSION_NOT_FOUND',
  SESSION_CLOSED: 'errors.SESSION_CLOSED',
  ANSWERS_MISMATCH: 'errors.ANSWERS_MISMATCH',
  INSUFFICIENT_IV: 'errors.INSUFFICIENT_IV',
  INVALID_AMOUNT: 'errors.INVALID_AMOUNT',
  SELF_TRANSFER: 'errors.SELF_TRANSFER',
  SELF_GIFT: 'errors.SELF_GIFT',
  LOOTBOX_NOT_FOUND: 'errors.LOOTBOX_NOT_FOUND',
  LOOTBOX_OPENED: 'errors.LOOTBOX_OPENED',
  CHALLENGE_NOT_STARTED: 'errors.CHALLENGE_NOT_STARTED',
  NO_WORDS: 'errors.NO_WORDS',
  ITEM_NOT_FOUND: 'errors.ITEM_NOT_FOUND',
  NOT_A_GIFT: 'errors.NOT_A_GIFT',
  SKIN_NOT_OWNED: 'errors.SKIN_NOT_OWNED',
  WORD_NOT_FOUND: 'errors.WORD_NOT_FOUND',
  ROOM_NOT_FOUND: 'errors.ROOM_NOT_FOUND',
  NOT_HOST: 'errors.NOT_HOST',
  ROOM_CLOSED: 'errors.ROOM_CLOSED',
  UNAUTHORIZED: 'errors.UNAUTHORIZED',
  INVALID_ID: 'errors.INVALID_ID',
  SERVER: 'errors.SERVER',
  PROFILE: 'errors.PROFILE',
} as const

export function gameName(t: TFunction, id: string, fallback: string) {
  const key = games[id as keyof typeof games]
  return key ? t(key) : fallback
}

export function skinName(t: TFunction, id: string, fallback: string) {
  const key = skins[id as keyof typeof skins]
  return key ? t(key) : fallback
}

export function ledgerLabel(t: TFunction, kind: string) {
  const key = ledger[kind as keyof typeof ledger]
  return key ? t(key) : kind
}

export function currencyLabel(t: TFunction, currency: string) {
  if (currency === 'iv') return t('currency.iv')
  if (currency === 'xp') return t('currency.xp')
  if (currency === 'money') return t('currency.money')
  return currency
}

export function errorText(t: TFunction, code: string, message: string) {
  const key = errors[code as keyof typeof errors]
  return key ? t(key) : message
}
