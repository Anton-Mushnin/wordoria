import { ECONOMY, REWARD_TABLE, SKINS } from './config.ts'
import { DomainError } from './errors.ts'
import { GAMES } from './games.ts'
import {
  applyPlaceMultiplier,
  convertPoints,
  levelFromXp,
  normalizeAnswers,
  sessionPoints,
  wordScore,
} from './scoring.ts'
import type {
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
import { pickHardestWords } from './words.ts'

type PlayerRecord = {
  id: string
  name: string
  iv: number
  money: number
  xp: number
  subscriptionUntil: Date | null
  equippedSkinId: string | null
  items: InventoryItem[]
}

type InventoryItem = {
  id: string
  kind: 'skin' | 'subscription_gift'
  skinId?: string
  days?: number
}

type WordList = {
  id: string
  title: string
  source: 'server' | 'upload'
  ownerId: string | null
  wordIds: string[]
}

type SessionPlayer = {
  playerId: string
  chargedIv: number
  statsSnapshot: Record<string, WordStat>
}

type Session = {
  id: string
  mode: GameMode
  gameId: string
  listId: string
  wordIds: string[]
  players: SessionPlayer[]
  status: 'active' | 'finished'
}

type Lootbox = {
  id: string
  playerId: string
  status: 'sealed' | 'opened'
  challenge: { wordIds: string[]; statsSnapshot: Record<string, WordStat> } | null
  reward: Reward | null
}

export type WordoriaOptions = {
  rng?: () => number
  now?: () => Date
}

export class Wordoria {
  private readonly rng: () => number
  private readonly now: () => Date
  private readonly players = new Map<string, PlayerRecord>()
  private readonly ledger: LedgerEntry[] = []
  private readonly words = new Map<string, Word>()
  private readonly wordsByKey = new Map<string, Word>()
  private readonly lists = new Map<string, WordList>()
  private readonly stats = new Map<string, WordStat>()
  private readonly sessions = new Map<string, Session>()
  private readonly lootboxes = new Map<string, Lootbox>()

  constructor(options: WordoriaOptions = {}) {
    this.rng = options.rng ?? Math.random
    this.now = options.now ?? (() => new Date())
  }

  register(name: string): PlayerView {
    const clean = name.trim()
    if (!clean) throw new DomainError('INVALID_NAME', 'Нужно имя')
    const player: PlayerRecord = {
      id: crypto.randomUUID(),
      name: clean,
      iv: 0,
      money: 0,
      xp: 0,
      subscriptionUntil: null,
      equippedSkinId: null,
      items: [],
    }
    this.players.set(player.id, player)
    return this.view(player)
  }

  getPlayer(playerId: string): PlayerView {
    return this.view(this.requirePlayer(playerId))
  }

  getLedger(playerId: string): LedgerEntry[] {
    this.requirePlayer(playerId)
    return this.ledger.filter((entry) => entry.playerId === playerId).map((entry) => ({ ...entry }))
  }

  listGames(): GameDefinition[] {
    return GAMES.map((game) => ({ ...game, modes: [...game.modes] }))
  }

  createServerList(title: string, words: WordDraft[]): WordListView {
    return this.addList(title, 'server', null, words)
  }

  uploadList(playerId: string, title: string, words: WordDraft[]): WordListView {
    this.requirePlayer(playerId)
    return this.addList(title, 'upload', playerId, words)
  }

  getList(listId: string): WordListView {
    const list = this.lists.get(listId)
    if (!list) throw new DomainError('LIST_NOT_FOUND', 'Список не найден')
    return this.listView(list)
  }

  startSolo(playerId: string, listId: string, gameId: string): SoloStart {
    const player = this.requirePlayer(playerId)
    const game = this.requireGame(gameId, 'solo')
    const list = this.requireList(listId, playerId)
    const sessionId = crypto.randomUUID()
    const chargedIv = this.charge(player, game.costIv, sessionId)
    const statsSnapshot = this.snapshot(playerId, list.wordIds)
    this.sessions.set(sessionId, {
      id: sessionId,
      mode: 'solo',
      gameId,
      listId,
      wordIds: [...list.wordIds],
      players: [{ playerId, chargedIv, statsSnapshot }],
      status: 'active',
    })
    return {
      sessionId,
      gameId,
      chargedIv,
      free: chargedIv === 0,
      input: this.buildInput(list.wordIds, statsSnapshot),
    }
  }

  finishSolo(sessionId: string, answers: Answer[]): SessionReward {
    const session = this.requireActive(sessionId)
    if (session.mode !== 'solo') throw new DomainError('MODE_UNSUPPORTED', 'Сессия не одиночная')
    const slot = session.players[0]!
    const ordered = normalizeAnswers(session.wordIds, answers)
    const reward = this.rewardPlayer(session, slot, ordered, 1, 1)
    session.status = 'finished'
    return reward
  }

  startMulti(playerIds: string[], listId: string, gameId: string) {
    if (playerIds.length < 2) throw new DomainError('NEED_OPPONENTS', 'Нужны минимум два игрока')
    if (new Set(playerIds).size !== playerIds.length) {
      throw new DomainError('DUPLICATE_PLAYER', 'Игрок указан дважды')
    }
    const game = this.requireGame(gameId, 'multi')
    const hostId = playerIds[0]!
    const list = this.requireList(listId, hostId)
    const players = playerIds.map((id) => this.requirePlayer(id))
    const sessionId = crypto.randomUUID()
    const slots = players.map((player) => ({
      playerId: player.id,
      chargedIv: this.charge(player, game.costIv, sessionId),
      statsSnapshot: this.snapshot(player.id, list.wordIds),
    }))
    this.sessions.set(sessionId, {
      id: sessionId,
      mode: 'multi',
      gameId,
      listId,
      wordIds: [...list.wordIds],
      players: slots,
      status: 'active',
    })
    const words = this.buildInput(list.wordIds, slots[0]!.statsSnapshot).words
    return {
      sessionId,
      gameId,
      words,
      players: slots.map((slot) => ({
        playerId: slot.playerId,
        chargedIv: slot.chargedIv,
        free: slot.chargedIv === 0,
        stats: this.buildInput(list.wordIds, slot.statsSnapshot).stats,
      })),
    }
  }

  finishMulti(
    sessionId: string,
    submissions: { playerId: string; answers: Answer[] }[],
    placements: Placement[],
  ): SessionReward[] {
    const session = this.requireActive(sessionId)
    if (session.mode !== 'multi') throw new DomainError('MODE_UNSUPPORTED', 'Сессия не многопользовательская')
    const playerIds = session.players.map((slot) => slot.playerId)
    this.assertPlacements(playerIds, placements)
    if (submissions.length !== playerIds.length) {
      throw new DomainError('ANSWERS_MISMATCH', 'Нужны ответы каждого игрока')
    }
    const byPlayer = new Map<string, Answer[]>()
    for (const submission of submissions) {
      if (!playerIds.includes(submission.playerId) || byPlayer.has(submission.playerId)) {
        throw new DomainError('ANSWERS_MISMATCH', 'Ответы должны быть у каждого игрока один раз')
      }
      byPlayer.set(submission.playerId, submission.answers)
    }
    const placeByPlayer = new Map(placements.map((placement) => [placement.playerId, placement.place]))
    const prepared = session.players.map((slot) => ({
      slot,
      ordered: normalizeAnswers(session.wordIds, byPlayer.get(slot.playerId)!),
      place: placeByPlayer.get(slot.playerId)!,
    }))
    const rewards = prepared.map(({ slot, ordered, place }) =>
      this.rewardPlayer(session, slot, ordered, place, playerIds.length),
    )
    session.status = 'finished'
    return rewards.sort((a, b) => a.place - b.place)
  }

  transferIv(fromId: string, toId: string, amount: number) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new DomainError('INVALID_AMOUNT', 'Сумма должна быть целым числом больше нуля')
    }
    if (fromId === toId) throw new DomainError('SELF_TRANSFER', 'Нельзя перевести ИВ себе')
    const from = this.requirePlayer(fromId)
    const to = this.requirePlayer(toId)
    if (from.iv < amount) throw new DomainError('INSUFFICIENT_IV', 'Не хватает ИВ')
    const refId = crypto.randomUUID()
    from.iv -= amount
    to.iv += amount
    this.pushLedger(from, 'transfer_out', 'iv', -amount, refId)
    this.pushLedger(to, 'transfer_in', 'iv', amount, refId)
    return { from: this.view(from), to: this.view(to) }
  }

  buyLootbox(playerId: string) {
    const player = this.requirePlayer(playerId)
    if (player.iv < ECONOMY.lootboxPriceIv) {
      throw new DomainError('INSUFFICIENT_IV', 'Не хватает ИВ на лутбокс')
    }
    player.iv -= ECONOMY.lootboxPriceIv
    const box: Lootbox = {
      id: crypto.randomUUID(),
      playerId,
      status: 'sealed',
      challenge: null,
      reward: null,
    }
    this.lootboxes.set(box.id, box)
    this.pushLedger(player, 'lootbox_purchase', 'iv', -ECONOMY.lootboxPriceIv, box.id)
    return { id: box.id, status: box.status, priceIv: ECONOMY.lootboxPriceIv, iv: player.iv }
  }

  getLootbox(lootboxId: string) {
    const box = this.lootboxes.get(lootboxId)
    if (!box) throw new DomainError('LOOTBOX_NOT_FOUND', 'Лутбокс не найден')
    return {
      id: box.id,
      playerId: box.playerId,
      status: box.status,
      reward: box.reward,
    }
  }

  startLootboxChallenge(playerId: string, lootboxId: string) {
    const box = this.requireSealedBox(playerId, lootboxId)
    const pool = this.wordPool(playerId)
    if (pool.length === 0) throw new DomainError('NO_WORDS', 'Нет слов для испытания')
    const stats = new Map<string, WordStat>()
    for (const word of pool) stats.set(word.id, { ...this.getStat(playerId, word.id) })
    const picked = pickHardestWords(
      pool,
      stats,
      Math.min(ECONOMY.lootboxWordCount, pool.length),
      ECONOMY.minSeenForHardness,
    )
    const wordIds = picked.map((word) => word.id)
    const statsSnapshot = this.snapshot(playerId, wordIds)
    box.challenge = { wordIds, statsSnapshot }
    return {
      lootboxId: box.id,
      limits: { maxErrors: ECONOMY.lootboxMaxErrors, maxTimeMs: ECONOMY.lootboxMaxTimeMs },
      input: this.buildInput(wordIds, statsSnapshot),
    }
  }

  finishLootboxChallenge(playerId: string, lootboxId: string, answers: Answer[]) {
    const box = this.requireSealedBox(playerId, lootboxId)
    if (!box.challenge) throw new DomainError('CHALLENGE_NOT_STARTED', 'Испытание не начато')
    const ordered = normalizeAnswers(box.challenge.wordIds, answers)
    const errors = ordered.filter((answer) => !answer.correct).length
    const timeMs = ordered.reduce((total, answer) => total + answer.timeMs, 0)
    this.bumpStats(playerId, ordered)
    const passed = errors <= ECONOMY.lootboxMaxErrors && timeMs <= ECONOMY.lootboxMaxTimeMs
    if (!passed) {
      box.challenge = null
      return { passed: false as const, errors, timeMs, reward: null }
    }
    const player = this.requirePlayer(playerId)
    const reward = this.rollReward(player)
    box.status = 'opened'
    box.reward = reward
    box.challenge = null
    return { passed: true as const, errors, timeMs, reward }
  }

  giftSubscription(fromId: string, toId: string, itemId: string) {
    if (fromId === toId) throw new DomainError('SELF_GIFT', 'Нельзя подарить подписку себе')
    const from = this.requirePlayer(fromId)
    const to = this.requirePlayer(toId)
    const index = from.items.findIndex((item) => item.id === itemId)
    if (index < 0) throw new DomainError('ITEM_NOT_FOUND', 'Предмет не найден')
    const item = from.items[index]!
    if (item.kind !== 'subscription_gift') throw new DomainError('NOT_A_GIFT', 'Этот предмет нельзя подарить')
    from.items.splice(index, 1)
    const until = this.extendSubscription(to, item.days ?? ECONOMY.subscriptionDays)
    return { from: this.view(from), to: this.view(to), until: until.toISOString() }
  }

  equipSkin(playerId: string, skinId: string | null): PlayerView {
    const player = this.requirePlayer(playerId)
    if (skinId !== null && !player.items.some((item) => item.kind === 'skin' && item.skinId === skinId)) {
      throw new DomainError('SKIN_NOT_OWNED', 'Скин не найден в инвентаре')
    }
    player.equippedSkinId = skinId
    return this.view(player)
  }

  private rewardPlayer(
    session: Session,
    slot: SessionPlayer,
    ordered: Answer[],
    place: number,
    playerCount: number,
  ): SessionReward {
    const scores = ordered.map((answer) => wordScore(slot.statsSnapshot[answer.wordId]?.timesSeen ?? 0, answer))
    const errors = ordered.filter((answer) => !answer.correct).length
    const basePoints = sessionPoints(scores, errors)
    const applied =
      playerCount < 2 ? { points: basePoints, multiplier: 1 } : applyPlaceMultiplier(basePoints, place, playerCount)
    const player = this.requirePlayer(slot.playerId)
    const gained = convertPoints(applied.points)
    player.iv += gained.iv
    player.xp += gained.xp
    if (gained.iv !== 0) this.pushLedger(player, 'exercise_reward', 'iv', gained.iv, session.id)
    if (gained.xp !== 0) this.pushLedger(player, 'exercise_xp', 'xp', gained.xp, session.id)
    this.bumpStats(slot.playerId, ordered)
    return {
      sessionId: session.id,
      playerId: slot.playerId,
      place,
      multiplier: applied.multiplier,
      basePoints,
      points: applied.points,
      ivGain: gained.iv,
      xpGain: gained.xp,
      errors,
      level: levelFromXp(player.xp),
      iv: player.iv,
      xp: player.xp,
    }
  }

  private rollReward(player: PlayerRecord): Reward {
    const picked = pickWeighted(REWARD_TABLE, this.rng)
    switch (picked.type) {
      case 'skin': {
        const owned = new Set(player.items.filter((item) => item.kind === 'skin').map((item) => item.skinId))
        const available = SKINS.filter((skin) => !owned.has(skin.id))
        if (available.length === 0) {
          player.money += ECONOMY.duplicateSkinMoney
          this.pushLedger(player, 'lootbox_money', 'money', ECONOMY.duplicateSkinMoney)
          return { type: 'money', amount: ECONOMY.duplicateSkinMoney }
        }
        const index = Math.min(available.length - 1, Math.floor(this.rng() * available.length))
        const skin = available[index]!
        player.items.push({ id: crypto.randomUUID(), kind: 'skin', skinId: skin.id })
        return { type: 'skin', skinId: skin.id, name: skin.name }
      }
      case 'money': {
        player.money += ECONOMY.moneyReward
        this.pushLedger(player, 'lootbox_money', 'money', ECONOMY.moneyReward)
        return { type: 'money', amount: ECONOMY.moneyReward }
      }
      case 'xp': {
        player.xp += ECONOMY.xpReward
        this.pushLedger(player, 'lootbox_xp', 'xp', ECONOMY.xpReward)
        return { type: 'xp', amount: ECONOMY.xpReward }
      }
      case 'subscription_self': {
        const until = this.extendSubscription(player, ECONOMY.subscriptionDays)
        return { type: 'subscription_self', days: ECONOMY.subscriptionDays, until: until.toISOString() }
      }
      case 'subscription_gift': {
        const item: InventoryItem = {
          id: crypto.randomUUID(),
          kind: 'subscription_gift',
          days: ECONOMY.subscriptionDays,
        }
        player.items.push(item)
        return { type: 'subscription_gift', itemId: item.id, days: ECONOMY.subscriptionDays }
      }
    }
  }

  private extendSubscription(player: PlayerRecord, days: number): Date {
    const now = this.now()
    const start = player.subscriptionUntil && player.subscriptionUntil > now ? player.subscriptionUntil : now
    const until = new Date(start.getTime() + days * 24 * 60 * 60 * 1000)
    player.subscriptionUntil = until
    return until
  }

  private charge(player: PlayerRecord, cost: number, refId: string): number {
    if (cost > 0 && player.iv >= cost) {
      player.iv -= cost
      this.pushLedger(player, 'exercise_fee', 'iv', -cost, refId)
      return cost
    }
    return 0
  }

  private pushLedger(
    player: PlayerRecord,
    kind: string,
    currency: LedgerEntry['currency'],
    amount: number,
    refId?: string,
  ) {
    const balanceAfter = currency === 'iv' ? player.iv : currency === 'money' ? player.money : player.xp
    this.ledger.push({
      id: crypto.randomUUID(),
      playerId: player.id,
      kind,
      currency,
      amount,
      balanceAfter,
      refId,
      at: this.now().toISOString(),
    })
  }

  private addList(title: string, source: WordList['source'], ownerId: string | null, drafts: WordDraft[]): WordListView {
    const titleClean = title.trim()
    if (!titleClean) throw new DomainError('INVALID_TITLE', 'Пустое название списка')
    if (drafts.length === 0) throw new DomainError('EMPTY_LIST', 'В списке нет слов')
    const cleaned = drafts.map((draft) => {
      const term = typeof draft.term === 'string' ? draft.term.trim() : ''
      const translation = typeof draft.translation === 'string' ? draft.translation.trim() : ''
      if (!term || !translation) throw new DomainError('INVALID_WORD', 'У слова нужны написание и перевод')
      return { term, translation }
    })
    const wordIds: string[] = []
    for (const draft of cleaned) {
      const key = `${draft.term.toLowerCase()}::${draft.translation.toLowerCase()}`
      let word = this.wordsByKey.get(key)
      if (!word) {
        word = { id: crypto.randomUUID(), term: draft.term, translation: draft.translation }
        this.words.set(word.id, word)
        this.wordsByKey.set(key, word)
      }
      if (!wordIds.includes(word.id)) wordIds.push(word.id)
    }
    const list: WordList = { id: crypto.randomUUID(), title: titleClean, source, ownerId, wordIds }
    this.lists.set(list.id, list)
    return this.listView(list)
  }

  private listView(list: WordList): WordListView {
    return {
      id: list.id,
      title: list.title,
      source: list.source,
      ownerId: list.ownerId,
      words: list.wordIds.map((id) => this.requireWord(id)),
    }
  }

  private buildInput(wordIds: string[], snapshot: Record<string, WordStat>): GameInput {
    return {
      words: wordIds.map((id) => this.requireWord(id)),
      stats: wordIds.map((wordId) => ({
        wordId,
        timesSeen: snapshot[wordId]?.timesSeen ?? 0,
        errorCount: snapshot[wordId]?.errorCount ?? 0,
      })),
    }
  }

  private snapshot(playerId: string, wordIds: string[]): Record<string, WordStat> {
    const snapshot: Record<string, WordStat> = {}
    for (const wordId of wordIds) snapshot[wordId] = { ...this.getStat(playerId, wordId) }
    return snapshot
  }

  private getStat(playerId: string, wordId: string): WordStat {
    return this.stats.get(this.statKey(playerId, wordId)) ?? { timesSeen: 0, errorCount: 0 }
  }

  private bumpStats(playerId: string, answers: Answer[]) {
    for (const answer of answers) {
      const current = this.getStat(playerId, answer.wordId)
      this.stats.set(this.statKey(playerId, answer.wordId), {
        timesSeen: current.timesSeen + 1,
        errorCount: current.errorCount + (answer.correct ? 0 : 1),
      })
    }
  }

  private statKey(playerId: string, wordId: string): string {
    return `${playerId}:${wordId}`
  }

  private wordPool(playerId: string): Word[] {
    const ids = new Set<string>()
    for (const list of this.lists.values()) {
      if (list.source === 'server' || list.ownerId === playerId) {
        for (const id of list.wordIds) ids.add(id)
      }
    }
    return [...ids].map((id) => this.requireWord(id))
  }

  private view(player: PlayerRecord): PlayerView {
    return {
      id: player.id,
      name: player.name,
      iv: player.iv,
      money: player.money,
      xp: player.xp,
      level: levelFromXp(player.xp),
      subscriptionUntil: player.subscriptionUntil ? player.subscriptionUntil.toISOString() : null,
      equippedSkinId: player.equippedSkinId,
      skins: player.items
        .filter((item) => item.kind === 'skin')
        .map((item) => ({
          id: item.id,
          skinId: item.skinId!,
          name: SKINS.find((skin) => skin.id === item.skinId)?.name ?? item.skinId!,
        })),
      gifts: player.items
        .filter((item) => item.kind === 'subscription_gift')
        .map((item) => ({ id: item.id, days: item.days! })),
    }
  }

  private requirePlayer(playerId: string): PlayerRecord {
    const player = this.players.get(playerId)
    if (!player) throw new DomainError('PLAYER_NOT_FOUND', 'Игрок не найден')
    return player
  }

  private requireWord(wordId: string): Word {
    const word = this.words.get(wordId)
    if (!word) throw new DomainError('WORD_NOT_FOUND', 'Слово не найдено')
    return { ...word }
  }

  private requireList(listId: string, hostId: string): WordList {
    const list = this.lists.get(listId)
    if (!list) throw new DomainError('LIST_NOT_FOUND', 'Список не найден')
    if (list.source === 'upload' && list.ownerId !== hostId) {
      throw new DomainError('LIST_FORBIDDEN', 'Чужой список')
    }
    return list
  }

  private requireGame(gameId: string, mode: GameMode): GameDefinition {
    const game = GAMES.find((item) => item.id === gameId)
    if (!game) throw new DomainError('GAME_NOT_FOUND', 'Игра не найдена')
    if (!game.modes.includes(mode)) throw new DomainError('MODE_UNSUPPORTED', 'Этот режим в игре недоступен')
    return game
  }

  private requireActive(sessionId: string): Session {
    const session = this.sessions.get(sessionId)
    if (!session) throw new DomainError('SESSION_NOT_FOUND', 'Сессия не найдена')
    if (session.status !== 'active') throw new DomainError('SESSION_CLOSED', 'Сессия уже завершена')
    return session
  }

  private requireSealedBox(playerId: string, lootboxId: string): Lootbox {
    this.requirePlayer(playerId)
    const box = this.lootboxes.get(lootboxId)
    if (!box) throw new DomainError('LOOTBOX_NOT_FOUND', 'Лутбокс не найден')
    if (box.playerId !== playerId) throw new DomainError('LOOTBOX_FORBIDDEN', 'Чужой лутбокс')
    if (box.status !== 'sealed') throw new DomainError('LOOTBOX_OPENED', 'Лутбокс уже открыт')
    return box
  }

  private assertPlacements(playerIds: string[], placements: Placement[]) {
    if (placements.length !== playerIds.length) {
      throw new DomainError('PLACEMENT_INVALID', 'Места заданы не для всех')
    }
    const seenPlayers = new Set<string>()
    const seenPlaces = new Set<number>()
    for (const placement of placements) {
      if (!playerIds.includes(placement.playerId) || seenPlayers.has(placement.playerId)) {
        throw new DomainError('PLACEMENT_INVALID', 'Неверный игрок в таблице мест')
      }
      seenPlayers.add(placement.playerId)
      if (
        !Number.isInteger(placement.place) ||
        placement.place < 1 ||
        placement.place > playerIds.length ||
        seenPlaces.has(placement.place)
      ) {
        throw new DomainError('PLACEMENT_INVALID', 'Места должны быть уникальными от 1 до числа игроков')
      }
      seenPlaces.add(placement.place)
    }
  }
}

function pickWeighted<T extends { weight: number }>(items: T[], rng: () => number): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  let ticket = rng() * total
  for (const item of items) {
    ticket -= item.weight
    if (ticket < 0) return item
  }
  return items[items.length - 1]!
}
