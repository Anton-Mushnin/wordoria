import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ECONOMY } from '../src/config.ts'
import { DomainError } from '../src/errors.ts'
import type { Answer, WordDraft } from '../src/types.ts'
import { Wordoria } from '../src/wordoria.ts'

const target = ECONOMY.targetAnswerMs

function drafts(count: number, prefix = 'w'): WordDraft[] {
  return Array.from({ length: count }, (_, index) => ({
    term: `${prefix}-${index}`,
    translation: `t-${prefix}-${index}`,
  }))
}

function codeOf(run: () => void): string {
  try {
    run()
  } catch (error) {
    assert.ok(error instanceof DomainError)
    return error.code
  }
  assert.fail('ожидалась ошибка')
}

function play(
  app: Wordoria,
  playerId: string,
  listId: string,
  mark: (wordId: string, index: number) => Answer,
  gameId = 'flashcards',
) {
  const started = app.startSolo(playerId, listId, gameId)
  const answers = started.input.words.map((word, index) => mark(word.id, index))
  return { started, result: app.finishSolo(started.sessionId, answers) }
}

function playPerfect(app: Wordoria, playerId: string, listId: string, gameId = 'flashcards') {
  return play(app, playerId, listId, (wordId) => ({ wordId, correct: true, timeMs: target }), gameId)
}

test('регистрация начинается с нуля', () => {
  const app = new Wordoria()
  const player = app.register('  Аня  ')
  assert.equal(player.name, 'Аня')
  assert.equal(player.iv, 0)
  assert.equal(player.money, 0)
  assert.equal(player.xp, 0)
  assert.equal(player.level, 1)
  assert.equal(player.subscriptionUntil, null)
  assert.equal(codeOf(() => app.register('   ')), 'INVALID_NAME')
})

test('без ИВ упражнение бесплатное и всё равно приносит награду', () => {
  const app = new Wordoria()
  const player = app.register('Аня')
  const list = app.uploadList(player.id, 'коты', drafts(1, 'cat'))
  const first = playPerfect(app, player.id, list.id)
  assert.equal(first.started.free, true)
  assert.equal(first.started.chargedIv, 0)
  assert.equal(first.started.input.words[0]?.translation, 't-cat-0')
  assert.equal(first.started.input.stats[0]?.timesSeen, 0)
  assert.equal(first.result.multiplier, 1)
  assert.equal(first.result.points, 100)
  assert.equal(first.result.ivGain, 10)
  assert.equal(first.result.xpGain, 100)
  assert.equal(first.result.level, 2)
  assert.equal(first.result.iv, 10)

  const paid = playPerfect(app, player.id, list.id)
  assert.equal(paid.started.free, false)
  assert.equal(paid.started.chargedIv, 10)
  assert.equal(paid.started.input.stats[0]?.timesSeen, 1)
  assert.equal(paid.result.basePoints, 50)
  assert.equal(paid.result.iv, 5)
})

test('если ИВ меньше цены, баланс не списывается', () => {
  const app = new Wordoria()
  const rich = app.register('Боря')
  const poor = app.register('Аня')
  const list = app.uploadList(rich.id, 'банк', drafts(10, 'bank'))
  playPerfect(app, rich.id, list.id)
  app.transferIv(rich.id, poor.id, 9)
  const own = app.uploadList(poor.id, 'свои', drafts(1, 'own'))
  const started = app.startSolo(poor.id, own.id, 'flashcards')
  assert.equal(started.free, true)
  assert.equal(app.getPlayer(poor.id).iv, 9)
})

test('одно и то же слово копится между списками', () => {
  const app = new Wordoria()
  const player = app.register('Аня')
  const pair = [{ term: 'cat', translation: 'кот' }]
  const first = app.createServerList('сервер', pair)
  const second = app.uploadList(player.id, 'мои', [{ term: ' Cat ', translation: ' КОТ ' }])
  assert.equal(first.words[0]?.id, second.words[0]?.id)
  playPerfect(app, player.id, first.id)
  const again = playPerfect(app, player.id, second.id)
  assert.equal(again.started.input.stats[0]?.timesSeen, 1)
  assert.equal(again.result.basePoints, 50)
})

test('чужой список закрыт, серверный открыт, соло-игра не идёт в мультиплеере', () => {
  const app = new Wordoria()
  const owner = app.register('Аня')
  const guest = app.register('Боря')
  const uploaded = app.uploadList(owner.id, 'мои', drafts(1))
  const server = app.createServerList('общие', drafts(1, 'srv'))
  assert.equal(codeOf(() => app.startSolo(guest.id, uploaded.id, 'flashcards')), 'LIST_FORBIDDEN')
  const shared = app.startSolo(guest.id, server.id, 'flashcards')
  assert.equal(shared.input.words.length, 1)
  assert.equal(codeOf(() => app.startMulti([owner.id, guest.id], server.id, 'flashcards')), 'MODE_UNSUPPORTED')
  assert.equal(codeOf(() => app.startMulti([guest.id, owner.id], uploaded.id, 'sprint')), 'LIST_FORBIDDEN')
  const hosted = app.startMulti([owner.id, guest.id], uploaded.id, 'sprint')
  assert.equal(hosted.players.length, 2)
})

test('скорость и ошибки входят в баллы сессии', () => {
  const app = new Wordoria()
  const player = app.register('Аня')
  const fast = app.uploadList(player.id, 'быстро', drafts(1, 'fast'))
  const fastResult = play(app, player.id, fast.id, (wordId) => ({ wordId, correct: true, timeMs: target / 2 }))
  assert.equal(fastResult.result.points, 200)

  const slow = app.uploadList(player.id, 'медленно', drafts(1, 'slow'))
  const slowResult = play(app, player.id, slow.id, (wordId) => ({ wordId, correct: true, timeMs: target * 4 }))
  assert.equal(slowResult.result.points, 50)

  const mixed = app.uploadList(player.id, 'ошибки', drafts(2, 'mix'))
  const mixedResult = play(app, player.id, mixed.id, (wordId, index) => ({
    wordId,
    correct: index === 0,
    timeMs: target,
  }))
  assert.equal(mixedResult.result.errors, 1)
  assert.equal(mixedResult.result.points, 50)
})

test('место в мультиплеере умножает баллы, последнее не ниже 1.05', () => {
  const app = new Wordoria()
  const names = ['Аня', 'Боря', 'Вера', 'Глеб']
  const players = names.map((name) => app.register(name))
  const list = app.createServerList('раунд', drafts(1, 'race'))
  const started = app.startMulti(
    players.map((player) => player.id),
    list.id,
    'blitz',
  )
  assert.ok(started.players.every((player) => player.free))
  const wordId = started.words[0]!.id
  const rewards = app.finishMulti(
    started.sessionId,
    players.map((player) => ({
      playerId: player.id,
      answers: [{ wordId, correct: true, timeMs: target }],
    })),
    players.map((player, index) => ({ playerId: player.id, place: index + 1 })),
  )
  assert.deepEqual(
    rewards.map((reward) => reward.points),
    [150, 135, 120, 105],
  )
  assert.deepEqual(
    rewards.map((reward) => reward.multiplier),
    [1.5, 1.35, 1.2, 1.05],
  )
  assert.deepEqual(
    rewards.map((reward) => reward.ivGain),
    [15, 14, 12, 11],
  )
  assert.equal(codeOf(() => app.finishMulti(started.sessionId, [], [])), 'SESSION_CLOSED')
})

test('перевод ИВ списывает и зачисляет, себе и в минус нельзя', () => {
  const app = new Wordoria()
  const from = app.register('Аня')
  const to = app.register('Боря')
  const list = app.uploadList(from.id, 'запас', drafts(10, 'pay'))
  playPerfect(app, from.id, list.id)
  const moved = app.transferIv(from.id, to.id, 30)
  assert.equal(moved.from.iv, 70)
  assert.equal(moved.to.iv, 30)
  assert.equal(codeOf(() => app.transferIv(from.id, to.id, 1000)), 'INSUFFICIENT_IV')
  assert.equal(app.getPlayer(from.id).iv, 70)
  assert.equal(codeOf(() => app.transferIv(from.id, from.id, 1)), 'SELF_TRANSFER')
  assert.equal(codeOf(() => app.transferIv(from.id, to.id, 1.5)), 'INVALID_AMOUNT')
})

test('лутбокс открывается только внутри лимитов и остаётся закрытым после провала', () => {
  const now = new Date('2026-01-01T00:00:00.000Z')
  const app = new Wordoria({ rng: () => 0.5, now: () => now })
  const player = app.register('Аня')
  const fund = app.uploadList(player.id, 'фонд', drafts(10, 'fund'))
  playPerfect(app, player.id, fund.id)
  const list = app.uploadList(player.id, 'сложное', drafts(5, 'hard'))
  const missed = play(app, player.id, list.id, (wordId, index) => ({ wordId, correct: index !== 0, timeMs: target }))
  play(app, player.id, list.id, (wordId, index) => ({ wordId, correct: index !== 0, timeMs: target }))
  const funded = app.getPlayer(player.id)
  assert.ok(funded.iv >= ECONOMY.lootboxPriceIv)

  const box = app.buyLootbox(player.id)
  assert.equal(app.getPlayer(player.id).iv, funded.iv - ECONOMY.lootboxPriceIv)
  const challenge = app.startLootboxChallenge(player.id, box.id)
  assert.equal(challenge.input.words[0]?.id, missed.started.input.words[0]?.id)
  assert.equal(challenge.limits.maxErrors, 1)

  const failed = app.finishLootboxChallenge(
    player.id,
    box.id,
    challenge.input.words.map((word, index) => ({ wordId: word.id, correct: index > 1, timeMs: 1000 })),
  )
  assert.equal(failed.passed, false)
  assert.equal(failed.reward, null)
  assert.equal(app.getLootbox(box.id).status, 'sealed')

  const retry = app.startLootboxChallenge(player.id, box.id)
  const opened = app.finishLootboxChallenge(
    player.id,
    box.id,
    retry.input.words.map((word) => ({ wordId: word.id, correct: true, timeMs: 1000 })),
  )
  assert.equal(opened.passed, true)
  assert.equal(opened.reward?.type, 'money')
  assert.equal(app.getPlayer(player.id).money, ECONOMY.moneyReward)
  assert.equal(app.getLootbox(box.id).status, 'opened')
  assert.equal(codeOf(() => app.buyLootbox(app.register('Нищий').id)), 'INSUFFICIENT_IV')
})

test('награды лутбокса: скин, опыт, подписка себе и подарок', () => {
  const now = new Date('2026-01-01T00:00:00.000Z')

  function open(rng: () => number) {
    const app = new Wordoria({ rng, now: () => now })
    const player = app.register('Аня')
    const list = app.uploadList(player.id, 'фонд', drafts(5, 'fund'))
    playPerfect(app, player.id, list.id)
    const box = app.buyLootbox(player.id)
    const challenge = app.startLootboxChallenge(player.id, box.id)
    const opened = app.finishLootboxChallenge(
      player.id,
      box.id,
      challenge.input.words.map((word) => ({ wordId: word.id, correct: true, timeMs: 500 })),
    )
    return { app, playerId: player.id, reward: opened.reward }
  }

  const skin = open(() => 0)
  assert.equal(skin.reward?.type, 'skin')
  if (skin.reward?.type === 'skin') {
    const equipped = skin.app.equipSkin(skin.playerId, skin.reward.skinId)
    assert.equal(equipped.equippedSkinId, 'inkwell')
  }

  const xp = open(() => 0.7)
  assert.equal(xp.reward?.type, 'xp')
  assert.equal(xp.app.getPlayer(xp.playerId).xp, 500 + ECONOMY.xpReward)

  const self = open(() => 0.9)
  assert.equal(self.reward?.type, 'subscription_self')
  assert.equal(self.app.getPlayer(self.playerId).subscriptionUntil, '2026-01-31T00:00:00.000Z')

  const gift = open(() => 0.97)
  assert.equal(gift.reward?.type, 'subscription_gift')
  const friend = gift.app.register('Боря')
  const giftReward = gift.reward
  assert.ok(giftReward && giftReward.type === 'subscription_gift')
  const given = gift.app.giftSubscription(gift.playerId, friend.id, giftReward.itemId)
  assert.equal(given.until, '2026-01-31T00:00:00.000Z')
  assert.equal(gift.app.getPlayer(gift.playerId).gifts.length, 0)
  assert.equal(codeOf(() => gift.app.giftSubscription(gift.playerId, friend.id, giftReward.itemId)), 'ITEM_NOT_FOUND')
  assert.equal(codeOf(() => gift.app.giftSubscription(friend.id, friend.id, 'x')), 'SELF_GIFT')
})

test('каждая игра получает свою колоду', () => {
  const app = new Wordoria({ rng: () => 0 })
  const player = app.register('Аня')
  const list = app.uploadList(player.id, 'длинный', drafts(30, 'long'))
  assert.equal(app.startSolo(player.id, list.id, 'flashcards').input.words.length, 10)
  assert.equal(app.startSolo(player.id, list.id, 'invaders').input.words.length, 12)
  assert.equal(app.startSolo(player.id, list.id, 'labyrinth').input.words.length, 5)
})

test('повтор уже собранного скина превращается в деньги', () => {
  const app = new Wordoria({ rng: () => 0 })
  const player = app.register('Аня')
  const list = app.uploadList(player.id, 'скины', drafts(30, 'skin'))
  let plays = 0
  while (app.getPlayer(player.id).iv < ECONOMY.lootboxPriceIv * 6) {
    playPerfect(app, player.id, list.id)
    plays += 1
    assert.ok(plays < 12)
  }
  let lastMoney = 0
  for (let index = 0; index < 6; index += 1) {
    const box = app.buyLootbox(player.id)
    const challenge = app.startLootboxChallenge(player.id, box.id)
    const opened = app.finishLootboxChallenge(
      player.id,
      box.id,
      challenge.input.words.map((word) => ({ wordId: word.id, correct: true, timeMs: 400 })),
    )
    lastMoney = opened.reward?.type === 'money' ? opened.reward.amount : 0
  }
  const view = app.getPlayer(player.id)
  assert.equal(view.skins.length, 5)
  assert.equal(view.money, ECONOMY.duplicateSkinMoney)
  assert.equal(lastMoney, ECONOMY.duplicateSkinMoney)
})

test('подписка себе продлевается от уже активной даты', () => {
  const now = new Date('2026-01-01T00:00:00.000Z')
  const app = new Wordoria({ rng: () => 0.9, now: () => now })
  const player = app.register('Аня')
  const list = app.uploadList(player.id, 'подписка', drafts(10, 'sub'))
  playPerfect(app, player.id, list.id)
  for (let index = 0; index < 2; index += 1) {
    const box = app.buyLootbox(player.id)
    const challenge = app.startLootboxChallenge(player.id, box.id)
    app.finishLootboxChallenge(
      player.id,
      box.id,
      challenge.input.words.map((word) => ({ wordId: word.id, correct: true, timeMs: 400 })),
    )
  }
  assert.equal(app.getPlayer(player.id).subscriptionUntil, '2026-03-02T00:00:00.000Z')
})
