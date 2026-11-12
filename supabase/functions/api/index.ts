import { createClient } from 'npm:@supabase/supabase-js@2'
import postgres from 'npm:postgres@3.4.5'
import { ECONOMY, REWARD_TABLE, SKINS } from '../../../src/config.ts'
import { DomainError } from '../../../src/errors.ts'
import { GAMES } from '../../../src/games.ts'
import {
  applyPlaceMultiplier,
  convertPoints,
  gradeTyped,
  levelFromXp,
  sessionPoints,
  wordScore,
} from '../../../src/scoring.ts'
import type { Answer, WordStat } from '../../../src/types.ts'
import { pickHardestWords, pickSessionWords, teacherDeal, teacherLevel } from '../../../src/words.ts'

class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const sql = postgres(databaseUrl(), {
  prepare: false,
  max: 1,
  idle_timeout: 20,
})

type Tx = postgres.TransactionSql
type Row = postgres.Row
type WordRow = { id: string; term: string; translation: string }
type StatSnap = Record<string, WordStat>
type Reward =
  | { type: 'skin'; skinId: string; name: string }
  | { type: 'money'; amount: number }
  | { type: 'xp'; amount: number }
  | { type: 'subscription_self'; days: number; until: string }
  | { type: 'subscription_gift'; itemId: string; days: number }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return respond({ error: { code: 'METHOD', message: 'Нужен POST' } }, 405)
  try {
    const userId = await requireUser(req)
    const body = (await req.json()) as Record<string, unknown>
    const result = await sql.begin((tx) => dispatch(tx, userId, body))
    return respond(result)
  } catch (error) {
    if (error instanceof DomainError) return respond({ error: { code: error.code, message: error.message } }, 400)
    if (error instanceof ApiError) return respond({ error: { code: error.code, message: error.message } }, error.status)
    console.error(error)
    return respond({ error: { code: 'INTERNAL', message: 'Не получилось выполнить действие' } }, 500)
  }
})

async function dispatch(tx: Tx, userId: string, body: Record<string, unknown>) {
  switch (body.action) {
    case 'upload-list':
      return uploadList(tx, userId, body)
    case 'session-start':
      return sessionStart(tx, userId, body)
    case 'session-finish':
      return sessionFinish(tx, userId, body)
    case 'transfer-iv':
      return transferIv(tx, userId, body)
    case 'lootbox-buy':
      return lootboxBuy(tx, userId)
    case 'lootbox-start':
      return lootboxStart(tx, userId, body)
    case 'lootbox-finish':
      return lootboxFinish(tx, userId, body)
    case 'gift-subscription':
      return giftSubscription(tx, userId, body)
    case 'equip-skin':
      return equipSkin(tx, userId, body)
    case 'room-create':
      return roomCreate(tx, userId, body)
    case 'room-join':
      return roomJoin(tx, userId, body)
    case 'room-leave':
      return roomLeave(tx, userId, body)
    default:
      throw new ApiError('UNKNOWN_ACTION', 'Неизвестное действие')
  }
}

async function uploadList(tx: Tx, userId: string, body: Record<string, unknown>) {
  await requireProfile(tx, userId)
  const title = text(body.title, 'INVALID_TITLE', 'Пустое название списка')
  if (title.length > 80) throw new ApiError('INVALID_TITLE', 'Название длиннее 80 знаков')
  const incoming = drafts(body.words)
  const seen = new Set<string>()
  const unique = incoming.filter((word) => {
    const key = `${word.term.toLowerCase()}::${word.translation.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const [list] = await tx<{ id: string }[]>`
    insert into word_lists (title, source, owner_id)
    values (${title}, 'upload', ${userId})
    returning id
  `
  const wordIds: string[] = []
  for (const word of unique) {
    const inserted = await tx<{ id: string }[]>`
      insert into words (term, translation)
      values (${word.term}, ${word.translation})
      on conflict (pair_key) do nothing
      returning id
    `
    const [row] = inserted.length
      ? inserted
      : await tx<{ id: string }[]>`
          select id from words
          where pair_key = ${`${word.term.toLowerCase()}::${word.translation.toLowerCase()}`}
        `
    if (!wordIds.includes(row.id)) wordIds.push(row.id)
  }
  for (const [position, wordId] of wordIds.entries()) {
    await tx`
      insert into list_words (list_id, word_id, position)
      values (${list.id}, ${wordId}, ${position})
    `
  }
  return { id: list.id, title, wordCount: wordIds.length }
}

async function sessionStart(tx: Tx, userId: string, body: Record<string, unknown>) {
  const mode = body.mode === 'multi' ? 'multi' : body.mode === 'solo' ? 'solo' : null
  if (!mode) throw new ApiError('MODE_UNSUPPORTED', 'Нужен режим упражнения')
  const listId = uuid(body.listId)
  const game = requireGame(str(body.gameId), mode)
  if (mode === 'solo') {
    const loaded = await loadList(tx, listId, userId)
    return openSession(tx, {
      mode,
      gameId: game.id,
      cost: game.costIv,
      listId,
      hostId: userId,
      playerIds: [userId],
      words: await dealForGame(tx, userId, game, loaded.words, body.level),
    })
  }
  const roomId = uuid(body.roomId)
  const [room] = await tx<Row[]>`select * from rooms where id = ${roomId} for update`
  if (!room) throw new ApiError('ROOM_NOT_FOUND', 'Комната не найдена')
  if (room.host_id !== userId) throw new ApiError('NOT_HOST', 'Начать может только хозяин комнаты')
  if (room.status !== 'lobby') throw new ApiError('ROOM_CLOSED', 'Комната уже ушла в упражнение')
  if (room.list_id !== listId || room.game_id !== game.id) {
    throw new ApiError('ROOM_CLOSED', 'Комната собрана на другое упражнение')
  }
  const members = await tx<{ player_id: string }[]>`
    select player_id from room_players where room_id = ${roomId} order by joined_at
  `
  if (members.length < 2) throw new ApiError('NEED_OPPONENTS', 'Нужны минимум два игрока')
  const loaded = await loadList(tx, listId, userId)
  const opened = await openSession(tx, {
    mode,
    gameId: game.id,
    cost: game.costIv,
    listId,
    hostId: userId,
    playerIds: members.map((member) => member.player_id),
    words: await dealForGame(tx, userId, game, loaded.words, body.level),
  })
  await tx`
    update rooms set status = 'playing', session_id = ${opened.sessionId}
    where id = ${roomId}
  `
  return opened
}

async function openSession(
  tx: Tx,
  input: {
    mode: 'solo' | 'multi'
    gameId: string
    cost: number
    listId: string
    hostId: string
    playerIds: string[]
    words: WordRow[]
  },
) {
  const wordIds = input.words.map((word) => word.id)
  const [session] = await tx<{ id: string }[]>`
    insert into sessions (mode, game_id, list_id, host_id, word_ids)
    values (${input.mode}, ${input.gameId}, ${input.listId}, ${input.hostId}, ${wordIds}::uuid[])
    returning id
  `
  let mine: { chargedIv: number; stats: { wordId: string; timesSeen: number; errorCount: number }[] } | null = null
  for (const playerId of input.playerIds) {
    const chargedIv = await charge(tx, playerId, input.cost, session.id)
    const stats = await snapshot(tx, playerId, wordIds)
    await tx`
      insert into session_players (session_id, player_id, charged_iv)
      values (${session.id}, ${playerId}, ${chargedIv})
    `
    await tx`
      insert into session_snapshots (session_id, player_id, stats)
      values (${session.id}, ${playerId}, ${tx.json(stats)})
    `
    if (playerId === input.hostId) {
      mine = {
        chargedIv,
        stats: wordIds.map((wordId) => ({
          wordId,
          timesSeen: stats[wordId]?.timesSeen ?? 0,
          errorCount: stats[wordId]?.errorCount ?? 0,
        })),
      }
    }
  }
  return {
    sessionId: session.id,
    gameId: input.gameId,
    mode: input.mode,
    chargedIv: mine?.chargedIv ?? 0,
    free: (mine?.chargedIv ?? 0) === 0,
    input: { words: input.words, stats: mine?.stats ?? [] },
  }
}

async function sessionFinish(tx: Tx, userId: string, body: Record<string, unknown>) {
  const sessionId = uuid(body.sessionId)
  const [session] = await tx<Row[]>`select * from sessions where id = ${sessionId} for update`
  if (!session) throw new ApiError('SESSION_NOT_FOUND', 'Сессия не найдена')
  if (session.status !== 'active') throw new ApiError('SESSION_CLOSED', 'Сессия уже завершена')
  const [me] = await tx<Row[]>`
    select * from session_players
    where session_id = ${sessionId} and player_id = ${userId}
    for update
  `
  if (!me) throw new ApiError('SESSION_NOT_FOUND', 'Сессия не найдена')
  if (me.finished) throw new ApiError('SESSION_CLOSED', 'Сессия уже завершена')
  const wordIds = asIds(session.word_ids)
  const words = await wordsByIds(tx, wordIds)
  const expect = session.game_id === 'dictation' ? 'term' : 'translation'
  const graded = gradeTyped(words, wordIds, typedAnswers(body.answers), expect)
  const [snap] = await tx<{ stats: StatSnap }[]>`
    select stats from session_snapshots
    where session_id = ${sessionId} and player_id = ${userId}
  `
  const scored = score(wordIds, snap?.stats ?? {}, graded)
  await saveAnswers(tx, sessionId, userId, scored.ordered)
  await bumpStats(tx, userId, scored.ordered)
  await tx`
    update session_players
    set finished = true,
        base_points = ${scored.basePoints},
        errors = ${scored.errors},
        total_time_ms = ${scored.totalTime}
    where session_id = ${sessionId} and player_id = ${userId}
  `
  if (session.mode === 'solo') {
    const gained = await credit(tx, userId, scored.basePoints, sessionId)
    await tx`
      update session_players
      set points = ${scored.basePoints},
          multiplier = 1,
          place = 1,
          iv_gain = ${gained.iv},
          xp_gain = ${gained.xp}
      where session_id = ${sessionId} and player_id = ${userId}
    `
    await tx`update sessions set status = 'finished' where id = ${sessionId}`
    return { waiting: false, ...gained, basePoints: scored.basePoints, points: scored.basePoints, multiplier: 1, place: 1, errors: scored.errors }
  }
  const mates = await tx<Row[]>`select * from session_players where session_id = ${sessionId}`
  if (mates.some((mate) => !mate.finished)) return { waiting: true, basePoints: scored.basePoints }
  const ranked = [...mates].sort((a, b) => {
    const points = Number(b.base_points) - Number(a.base_points)
    if (points !== 0) return points
    const time = Number(a.total_time_ms) - Number(b.total_time_ms)
    if (time !== 0) return time
    return String(a.player_id).localeCompare(String(b.player_id))
  })
  let mine: Record<string, unknown> = { waiting: false }
  for (const [index, mate] of ranked.entries()) {
    const applied = applyPlaceMultiplier(Number(mate.base_points), index + 1, ranked.length)
    const gained = await credit(tx, String(mate.player_id), applied.points, sessionId)
    await tx`
      update session_players
      set points = ${applied.points},
          multiplier = ${applied.multiplier},
          place = ${index + 1},
          iv_gain = ${gained.iv},
          xp_gain = ${gained.xp}
      where session_id = ${sessionId} and player_id = ${mate.player_id}
    `
    if (mate.player_id === userId) {
      mine = {
        waiting: false,
        ...gained,
        basePoints: Number(mate.base_points),
        points: applied.points,
        multiplier: applied.multiplier,
        place: index + 1,
        errors: Number(mate.errors),
      }
    }
  }
  await tx`update sessions set status = 'finished' where id = ${sessionId}`
  await tx`update rooms set status = 'done' where session_id = ${sessionId}`
  return mine
}

async function transferIv(tx: Tx, userId: string, body: Record<string, unknown>) {
  const amount = body.amount
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
    throw new ApiError('INVALID_AMOUNT', 'Сумма должна быть целым числом больше нуля')
  }
  const toName = text(body.toName, 'PLAYER_NOT_FOUND', 'Игрок не найден')
  const [target] = await tx<{ id: string }[]>`
    select id from profiles where lower(name) = lower(${toName})
  `
  if (!target) throw new ApiError('PLAYER_NOT_FOUND', 'Игрок не найден')
  if (target.id === userId) throw new ApiError('SELF_TRANSFER', 'Нельзя перевести ИВ себе')
  const ids = [userId, target.id].sort()
  await tx`select id from profiles where id = any(${ids}::uuid[]) order by id for update`
  const [from] = await tx<{ iv: number }[]>`select iv from profiles where id = ${userId}`
  if (from.iv < amount) throw new ApiError('INSUFFICIENT_IV', 'Не хватает ИВ')
  const [nextFrom] = await tx<{ iv: number }[]>`
    update profiles set iv = iv - ${amount} where id = ${userId} returning iv
  `
  const [nextTo] = await tx<{ iv: number }[]>`
    update profiles set iv = iv + ${amount} where id = ${target.id} returning iv
  `
  const refId = crypto.randomUUID()
  await ledger(tx, userId, 'transfer_out', 'iv', -amount, nextFrom.iv, refId)
  await ledger(tx, target.id, 'transfer_in', 'iv', amount, nextTo.iv, refId)
  return { iv: nextFrom.iv }
}

async function lootboxBuy(tx: Tx, userId: string) {
  const price = ECONOMY.lootboxPriceIv
  const [row] = await tx<{ iv: number }[]>`
    update profiles set iv = iv - ${price}
    where id = ${userId} and iv >= ${price}
    returning iv
  `
  if (!row) throw new ApiError('INSUFFICIENT_IV', 'Не хватает ИВ на лутбокс')
  const [box] = await tx<{ id: string }[]>`
    insert into lootboxes (player_id) values (${userId}) returning id
  `
  await ledger(tx, userId, 'lootbox_purchase', 'iv', -price, row.iv, box.id)
  return { id: box.id, iv: row.iv, priceIv: price }
}

async function lootboxStart(tx: Tx, userId: string, body: Record<string, unknown>) {
  const lootboxId = uuid(body.lootboxId)
  const [box] = await tx<Row[]>`
    select * from lootboxes where id = ${lootboxId} and player_id = ${userId} for update
  `
  if (!box) throw new ApiError('LOOTBOX_NOT_FOUND', 'Лутбокс не найден')
  if (box.status !== 'sealed') throw new ApiError('LOOTBOX_OPENED', 'Лутбокс уже открыт')
  const pool = await tx<WordRow[]>`
    select distinct w.id, w.term, w.translation
    from words w
    join list_words lw on lw.word_id = w.id
    join word_lists wl on wl.id = lw.list_id
    where wl.source = 'server' or wl.owner_id = ${userId}
  `
  if (pool.length === 0) throw new ApiError('NO_WORDS', 'Нет слов для испытания')
  const statRows = await tx<{ word_id: string; times_seen: number; error_count: number; recent: unknown }[]>`
    select word_id, times_seen, error_count, recent from word_stats where player_id = ${userId}
  `
  const stats = new Map(statRows.map((row) => [row.word_id, statFromRow(row)]))
  const picked = pickHardestWords(pool, stats, Math.min(ECONOMY.lootboxWordCount, pool.length), ECONOMY.minSeenForHardness)
  await tx`
    update lootboxes
    set challenge = ${tx.json({ wordIds: picked.map((word) => word.id) })}
    where id = ${lootboxId}
  `
  return {
    lootboxId,
    limits: { maxErrors: ECONOMY.lootboxMaxErrors, maxTimeMs: ECONOMY.lootboxMaxTimeMs },
    input: {
      words: picked,
      stats: picked.map((word) => ({
        wordId: word.id,
        timesSeen: stats.get(word.id)?.timesSeen ?? 0,
        errorCount: stats.get(word.id)?.errorCount ?? 0,
      })),
    },
  }
}

async function lootboxFinish(tx: Tx, userId: string, body: Record<string, unknown>) {
  const lootboxId = uuid(body.lootboxId)
  const [box] = await tx<Row[]>`
    select * from lootboxes where id = ${lootboxId} and player_id = ${userId} for update
  `
  if (!box) throw new ApiError('LOOTBOX_NOT_FOUND', 'Лутбокс не найден')
  if (box.status !== 'sealed') throw new ApiError('LOOTBOX_OPENED', 'Лутбокс уже открыт')
  const challenge = box.challenge as { wordIds?: string[] } | null
  if (!challenge?.wordIds?.length) throw new ApiError('CHALLENGE_NOT_STARTED', 'Испытание не начато')
  const words = await wordsByIds(tx, challenge.wordIds)
  const graded = gradeTyped(words, challenge.wordIds, typedAnswers(body.answers), 'translation')
  const errors = graded.filter((answer) => !answer.correct).length
  const timeMs = graded.reduce((total, answer) => total + answer.timeMs, 0)
  await bumpStats(tx, userId, graded)
  const passed = errors <= ECONOMY.lootboxMaxErrors && timeMs <= ECONOMY.lootboxMaxTimeMs
  if (!passed) {
    await tx`update lootboxes set challenge = null where id = ${lootboxId}`
    return { passed: false, errors, timeMs, reward: null }
  }
  const reward = await rollReward(tx, userId)
  await tx`
    update lootboxes
    set status = 'opened', reward = ${tx.json(reward)}, challenge = null
    where id = ${lootboxId}
  `
  return { passed: true, errors, timeMs, reward }
}

async function giftSubscription(tx: Tx, userId: string, body: Record<string, unknown>) {
  const itemId = uuid(body.itemId)
  const toName = text(body.toName, 'PLAYER_NOT_FOUND', 'Игрок не найден')
  const [target] = await tx<Row[]>`select * from profiles where lower(name) = lower(${toName}) for update`
  if (!target) throw new ApiError('PLAYER_NOT_FOUND', 'Игрок не найден')
  if (target.id === userId) throw new ApiError('SELF_GIFT', 'Нельзя подарить подписку себе')
  const [item] = await tx<Row[]>`
    select * from inventory where id = ${itemId} and player_id = ${userId} for update
  `
  if (!item) throw new ApiError('ITEM_NOT_FOUND', 'Предмет не найден')
  if (item.kind !== 'subscription_gift') throw new ApiError('NOT_A_GIFT', 'Этот предмет нельзя подарить')
  await tx`delete from inventory where id = ${itemId}`
  const until = await extendSubscription(tx, String(target.id), Number(item.days ?? ECONOMY.subscriptionDays), target.subscription_until)
  return { until }
}

async function equipSkin(tx: Tx, userId: string, body: Record<string, unknown>) {
  const skinId = body.skinId === null ? null : str(body.skinId)
  if (skinId !== null) {
    const [owned] = await tx<Row[]>`
      select id from inventory
      where player_id = ${userId} and kind = 'skin' and skin_id = ${skinId}
    `
    if (!owned) throw new ApiError('SKIN_NOT_OWNED', 'Скин не найден в инвентаре')
  }
  await tx`update profiles set equipped_skin_id = ${skinId} where id = ${userId}`
  return { equippedSkinId: skinId }
}

async function roomCreate(tx: Tx, userId: string, body: Record<string, unknown>) {
  const listId = uuid(body.listId)
  const game = requireGame(str(body.gameId), 'multi')
  await loadList(tx, listId, userId)
  const code = await freshCode(tx)
  const [room] = await tx<{ id: string }[]>`
    insert into rooms (code, host_id, list_id, game_id)
    values (${code}, ${userId}, ${listId}, ${game.id})
    returning id
  `
  await tx`insert into room_players (room_id, player_id) values (${room.id}, ${userId})`
  return { id: room.id, code, gameId: game.id, listId }
}

async function roomJoin(tx: Tx, userId: string, body: Record<string, unknown>) {
  const code = roomCode(body.code)
  const [room] = await tx<Row[]>`select * from rooms where code = ${code} for update`
  if (!room) throw new ApiError('ROOM_NOT_FOUND', 'Комната не найдена')
  if (room.status !== 'lobby') throw new ApiError('ROOM_CLOSED', 'Комната уже ушла в упражнение')
  await tx`
    insert into room_players (room_id, player_id)
    values (${room.id}, ${userId})
    on conflict do nothing
  `
  return { id: room.id, code: room.code, gameId: room.game_id, listId: room.list_id }
}

async function roomLeave(tx: Tx, userId: string, body: Record<string, unknown>) {
  const roomId = uuid(body.roomId)
  const [room] = await tx<Row[]>`select * from rooms where id = ${roomId} for update`
  if (!room) throw new ApiError('ROOM_NOT_FOUND', 'Комната не найдена')
  if (room.status !== 'lobby') throw new ApiError('ROOM_CLOSED', 'Сначала сдайтесь в упражнении')
  if (room.host_id === userId) {
    await tx`delete from rooms where id = ${roomId}`
    return { closed: true }
  }
  await tx`delete from room_players where room_id = ${roomId} and player_id = ${userId}`
  return { closed: false }
}

function score(wordIds: string[], stats: StatSnap, answers: Answer[]) {
  const ordered = answers
  const scores = ordered.map((answer) => wordScore(stats[answer.wordId]?.timesSeen ?? 0, answer))
  const errors = ordered.filter((answer) => !answer.correct).length
  return {
    ordered,
    errors,
    basePoints: sessionPoints(scores, errors),
    totalTime: ordered.reduce((total, answer) => total + answer.timeMs, 0),
  }
}

async function charge(tx: Tx, playerId: string, cost: number, refId: string) {
  if (cost <= 0) return 0
  const [row] = await tx<{ iv: number }[]>`
    update profiles set iv = iv - ${cost}
    where id = ${playerId} and iv >= ${cost}
    returning iv
  `
  if (!row) return 0
  await ledger(tx, playerId, 'exercise_fee', 'iv', -cost, row.iv, refId)
  return cost
}

async function credit(tx: Tx, playerId: string, points: number, refId: string) {
  const gained = convertPoints(points)
  const [row] = await tx<{ iv: number; xp: number }[]>`
    update profiles
    set iv = iv + ${gained.iv}, xp = xp + ${gained.xp}
    where id = ${playerId}
    returning iv, xp
  `
  if (gained.iv !== 0) await ledger(tx, playerId, 'exercise_reward', 'iv', gained.iv, row.iv, refId)
  if (gained.xp !== 0) await ledger(tx, playerId, 'exercise_xp', 'xp', gained.xp, row.xp, refId)
  return { ivGain: gained.iv, xpGain: gained.xp, iv: row.iv, xp: row.xp, level: levelFromXp(row.xp) }
}

async function ledger(
  tx: Tx,
  playerId: string,
  kind: string,
  currency: 'iv' | 'money' | 'xp',
  amount: number,
  balanceAfter: number,
  refId?: string,
) {
  await tx`
    insert into ledger (player_id, kind, currency, amount, balance_after, ref_id)
    values (${playerId}, ${kind}, ${currency}, ${amount}, ${balanceAfter}, ${refId ?? null})
  `
}

function readRecent(value: unknown): number[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.replace(/^\{|\}$/g, '').split(',').filter(Boolean)
      : []
  return raw.map(Number).filter((mark) => mark === 0 || mark === 1).slice(-3)
}

function statFromRow(row: { times_seen: number; error_count: number; recent: unknown }): WordStat {
  return { timesSeen: row.times_seen, errorCount: row.error_count, recent: readRecent(row.recent) }
}

async function snapshot(tx: Tx, playerId: string, wordIds: string[]): Promise<StatSnap> {
  const rows = await tx<{ word_id: string; times_seen: number; error_count: number; recent: unknown }[]>`
    select word_id, times_seen, error_count, recent from word_stats where player_id = ${playerId}
  `
  const stats: StatSnap = {}
  for (const wordId of wordIds) stats[wordId] = { timesSeen: 0, errorCount: 0, recent: [] }
  for (const row of rows) {
    if (stats[row.word_id]) stats[row.word_id] = statFromRow(row)
  }
  return stats
}

async function bumpStats(tx: Tx, playerId: string, answers: Answer[]) {
  for (const answer of answers) {
    const mark = answer.correct ? 0 : 1
    await tx`
      insert into word_stats (player_id, word_id, times_seen, error_count, recent)
      values (${playerId}, ${answer.wordId}, 1, ${mark}, array[${mark}]::smallint[])
      on conflict (player_id, word_id) do update
      set times_seen = word_stats.times_seen + 1,
          error_count = word_stats.error_count + excluded.error_count,
          recent = (
            select coalesce(array_agg(outcome order by ord), '{}'::smallint[])
            from (
              select outcome, ord
              from unnest(word_stats.recent || excluded.recent) with ordinality as attempt(outcome, ord)
              order by ord desc
              limit 3
            ) last_three
          )
    `
  }
}

async function saveAnswers(tx: Tx, sessionId: string, playerId: string, answers: Answer[]) {
  for (const answer of answers) {
    await tx`
      insert into session_answers (session_id, player_id, word_id, correct, time_ms)
      values (${sessionId}, ${playerId}, ${answer.wordId}, ${answer.correct}, ${answer.timeMs})
    `
  }
}

async function rollReward(tx: Tx, userId: string): Promise<Reward> {
  const picked = pickWeighted(REWARD_TABLE)
  if (picked.type === 'skin') {
    const items = await tx<{ skin_id: string | null }[]>`
      select skin_id from inventory where player_id = ${userId} and kind = 'skin'
    `
    const owned = new Set(items.map((item) => item.skin_id))
    const available = SKINS.filter((skin) => !owned.has(skin.id))
    if (available.length === 0) {
      const [row] = await tx<{ money: number }[]>`
        update profiles set money = money + ${ECONOMY.duplicateSkinMoney}
        where id = ${userId}
        returning money
      `
      await ledger(tx, userId, 'lootbox_money', 'money', ECONOMY.duplicateSkinMoney, row.money)
      return { type: 'money', amount: ECONOMY.duplicateSkinMoney }
    }
    const skin = available[Math.min(available.length - 1, Math.floor(Math.random() * available.length))]!
    await tx`
      insert into inventory (player_id, kind, skin_id)
      values (${userId}, 'skin', ${skin.id})
    `
    return { type: 'skin', skinId: skin.id, name: skin.name }
  }
  if (picked.type === 'money') {
    const [row] = await tx<{ money: number }[]>`
      update profiles set money = money + ${ECONOMY.moneyReward}
      where id = ${userId}
      returning money
    `
    await ledger(tx, userId, 'lootbox_money', 'money', ECONOMY.moneyReward, row.money)
    return { type: 'money', amount: ECONOMY.moneyReward }
  }
  if (picked.type === 'xp') {
    const [row] = await tx<{ xp: number }[]>`
      update profiles set xp = xp + ${ECONOMY.xpReward}
      where id = ${userId}
      returning xp
    `
    await ledger(tx, userId, 'lootbox_xp', 'xp', ECONOMY.xpReward, row.xp)
    return { type: 'xp', amount: ECONOMY.xpReward }
  }
  if (picked.type === 'subscription_self') {
    const [profile] = await tx<Row[]>`select subscription_until from profiles where id = ${userId} for update`
    const until = await extendSubscription(tx, userId, ECONOMY.subscriptionDays, profile.subscription_until)
    return { type: 'subscription_self', days: ECONOMY.subscriptionDays, until }
  }
  const [item] = await tx<{ id: string }[]>`
    insert into inventory (player_id, kind, days)
    values (${userId}, 'subscription_gift', ${ECONOMY.subscriptionDays})
    returning id
  `
  return { type: 'subscription_gift', itemId: item.id, days: ECONOMY.subscriptionDays }
}

async function extendSubscription(tx: Tx, playerId: string, days: number, current: unknown) {
  const now = new Date()
  const have = current ? new Date(String(current)) : null
  const start = have && have > now ? have : now
  const until = new Date(start.getTime() + days * 24 * 60 * 60 * 1000)
  await tx`update profiles set subscription_until = ${until.toISOString()} where id = ${playerId}`
  return until.toISOString()
}

async function loadList(tx: Tx, listId: string, hostId: string) {
  const [list] = await tx<Row[]>`select id, source, owner_id from word_lists where id = ${listId}`
  if (!list) throw new ApiError('LIST_NOT_FOUND', 'Список не найден')
  if (list.source === 'upload' && list.owner_id !== hostId) throw new ApiError('LIST_FORBIDDEN', 'Чужой список')
  const words = await tx<WordRow[]>`
    select w.id, w.term, w.translation
    from list_words lw
    join words w on w.id = lw.word_id
    where lw.list_id = ${listId}
    order by lw.position
  `
  if (words.length === 0) throw new ApiError('EMPTY_LIST', 'В списке нет слов')
  return { list, words }
}

async function wordsByIds(tx: Tx, wordIds: string[]) {
  const rows = await tx<WordRow[]>`
    select id, term, translation from words where id = any(${wordIds}::uuid[])
  `
  const byId = new Map(rows.map((word) => [word.id, word]))
  return wordIds.map((id) => {
    const word = byId.get(id)
    if (!word) throw new ApiError('WORD_NOT_FOUND', 'Слово не найдено')
    return word
  })
}

async function requireProfile(tx: Tx, userId: string) {
  const [profile] = await tx<Row[]>`select id from profiles where id = ${userId}`
  if (!profile) throw new ApiError('PLAYER_NOT_FOUND', 'Игрок не найден', 401)
  return profile
}

async function dealForGame(tx: Tx, hostId: string, game: { id: string; words: number }, words: WordRow[], level: unknown) {
  if (game.id === 'teacher') return dealTeacher(words, level)
  const snap = await snapshot(tx, hostId, words.map((word) => word.id))
  return pickSessionWords(words, new Map(Object.entries(snap)), game.words)
}

function dealTeacher(words: WordRow[], level: unknown): WordRow[] {
  const parsed = typeof level === 'number' ? level : Number(level)
  if (!teacherLevel(parsed)) throw new ApiError('MODE_UNSUPPORTED', 'Нужен уровень от 1 до 6')
  const dealt = teacherDeal(words, parsed)
  if (dealt.length === 0) throw new ApiError('EMPTY_LIST', 'В списке нет слов')
  return dealt
}

function requireGame(gameId: string, mode: 'solo' | 'multi') {
  const game = GAMES.find((item) => item.id === gameId)
  if (!game) throw new ApiError('GAME_NOT_FOUND', 'Игра не найдена')
  if (!game.modes.includes(mode)) throw new ApiError('MODE_UNSUPPORTED', 'Этот режим в игре недоступен')
  return game
}

async function freshCode(tx: Tx) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const bytes = crypto.getRandomValues(new Uint8Array(6))
    const code = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')
    const [taken] = await tx<Row[]>`select id from rooms where code = ${code}`
    if (!taken) return code
  }
  throw new ApiError('ROOM_NOT_FOUND', 'Не удалось собрать код комнаты', 500)
}

function pickWeighted<T extends { weight: number }>(items: readonly T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  let ticket = Math.random() * total
  for (const item of items) {
    ticket -= item.weight
    if (ticket < 0) return item
  }
  return items[items.length - 1]!
}

function typedAnswers(value: unknown) {
  if (!Array.isArray(value)) throw new ApiError('ANSWERS_MISMATCH', 'Нет ответов')
  return value.map((item) => {
    const row = item as { wordId?: unknown; typed?: unknown; timeMs?: unknown }
    return {
      wordId: typeof row.wordId === 'string' ? row.wordId : '',
      typed: typeof row.typed === 'string' ? row.typed : '',
      timeMs: typeof row.timeMs === 'number' ? row.timeMs : 0,
    }
  })
}

function drafts(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new ApiError('EMPTY_LIST', 'В списке нужны слова, не больше 100')
  }
  return value.map((item) => {
    const row = item as { term?: unknown; translation?: unknown }
    const term = typeof row.term === 'string' ? row.term.trim() : ''
    const translation = typeof row.translation === 'string' ? row.translation.trim() : ''
    if (!term || !translation) throw new ApiError('INVALID_WORD', 'У слова нужны написание и перевод')
    return { term, translation }
  })
}

function asIds(value: unknown) {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') return value.replace(/^\{|\}$/g, '').split(',').filter(Boolean)
  throw new ApiError('WORD_NOT_FOUND', 'Список слов сессии повреждён', 500)
}

function uuid(value: unknown, message = 'Не найден идентификатор') {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError('INVALID_ID', message)
  }
  return value
}

function str(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function text(value: unknown, code: string, message: string) {
  const clean = str(value)
  if (!clean) throw new ApiError(code, message)
  return clean
}

function roomCode(value: unknown) {
  const code = str(value).toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new ApiError('ROOM_NOT_FOUND', 'Комната не найдена')
  return code
}

async function requireUser(req: Request) {
  const header = req.headers.get('Authorization')
  if (!header) throw new ApiError('UNAUTHORIZED', 'Нужно войти', 401)
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: header } },
  })
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new ApiError('UNAUTHORIZED', 'Нужно войти', 401)
  return data.user.id
}

function databaseUrl() {
  const raw = Deno.env.get('SUPABASE_DB_URL') ?? ''
  // The edge runtime reaches Postgres by the network alias `db`.
  return raw.replace('@supabase_db_wordoria:', '@db:')
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
