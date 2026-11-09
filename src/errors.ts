export type DomainErrorCode =
  | 'INVALID_NAME'
  | 'INVALID_TITLE'
  | 'INVALID_WORD'
  | 'EMPTY_LIST'
  | 'PLAYER_NOT_FOUND'
  | 'LIST_NOT_FOUND'
  | 'LIST_FORBIDDEN'
  | 'GAME_NOT_FOUND'
  | 'MODE_UNSUPPORTED'
  | 'NEED_OPPONENTS'
  | 'DUPLICATE_PLAYER'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_CLOSED'
  | 'ANSWERS_MISMATCH'
  | 'INVALID_ANSWER'
  | 'PLACEMENT_INVALID'
  | 'INSUFFICIENT_IV'
  | 'INVALID_AMOUNT'
  | 'SELF_TRANSFER'
  | 'SELF_GIFT'
  | 'LOOTBOX_NOT_FOUND'
  | 'LOOTBOX_FORBIDDEN'
  | 'LOOTBOX_OPENED'
  | 'CHALLENGE_NOT_STARTED'
  | 'NO_WORDS'
  | 'ITEM_NOT_FOUND'
  | 'NOT_A_GIFT'
  | 'SKIN_NOT_OWNED'
  | 'WORD_NOT_FOUND'

export class DomainError extends Error {
  readonly code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}
