import { useEffect, useState } from 'react'
import { useAuth } from '../auth.tsx'
import { Stamp } from '../components/Marks.tsx'
import { ECONOMY } from '../domain.ts'
import { LineExercise, type TypedAnswer, type WordCard } from '../exercise/exercises.tsx'
import { ApiError, callApi } from '../lib/api.ts'
import { supabase } from '../lib/supabase.ts'

type Box = { id: string; status: 'sealed' | 'opened'; reward: Reward | null }
type Reward =
  | { type: 'skin'; skinId: string; name: string }
  | { type: 'money'; amount: number }
  | { type: 'xp'; amount: number }
  | { type: 'subscription_self'; days: number; until: string }
  | { type: 'subscription_gift'; itemId: string; days: number }

export function LootboxPage() {
  const { profile, refresh, session } = useAuth()
  const [boxes, setBoxes] = useState<Box[]>([])
  const [challenge, setChallenge] = useState<{ lootboxId: string; words: WordCard[]; maxTimeMs: number } | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [note, setNote] = useState('')

  async function load() {
    if (!session) return
    const { data } = await supabase
      .from('lootboxes')
      .select('id, status, reward')
      .eq('player_id', session.user.id)
      .order('created_at', { ascending: false })
    setBoxes((data ?? []) as Box[])
  }

  useEffect(() => {
    void load()
  }, [session])

  async function buy() {
    setError('')
    setPending(true)
    try {
      await callApi({ action: 'lootbox-buy' })
      await refresh()
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Конверт не куплен')
    } finally {
      setPending(false)
    }
  }

  async function open(lootboxId: string) {
    setError('')
    setNote('')
    try {
      const started = await callApi<{
        lootboxId: string
        limits: { maxTimeMs: number }
        input: { words: WordCard[] }
      }>({ action: 'lootbox-start', lootboxId })
      setChallenge({ lootboxId: started.lootboxId, words: started.input.words, maxTimeMs: started.limits.maxTimeMs })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Испытание не началось')
    }
  }

  async function finish(answers: TypedAnswer[]) {
    if (!challenge) return
    setPending(true)
    setError('')
    try {
      const result = await callApi<{ passed: boolean; reward: Reward | null }>({
        action: 'lootbox-finish',
        lootboxId: challenge.lootboxId,
        answers,
      })
      setChallenge(null)
      setNote(result.passed && result.reward ? rewardText(result.reward) : 'Мимо лимита. Конверт ещё закрыт.')
      await refresh()
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Ответ не принят')
    } finally {
      setPending(false)
    }
  }

  const canBuy = (profile?.iv ?? 0) >= ECONOMY.lootboxPriceIv

  return (
    <>
      <p className="eyebrow">Конверт</p>
      <p className="cover-line">Внутри скин, деньги, уровень или подписка.</p>
      <p className="meta">
        Чтобы открыть, уложитесь в {ECONOMY.lootboxMaxErrors} ошибку и {ECONOMY.lootboxMaxTimeMs / 1000} секунд.
      </p>
      {error ? <p className="error-line" role="alert">{error}</p> : null}
      {note ? <Stamp tone={note.startsWith('Мимо') ? 'bad' : 'ok'}>{note.startsWith('Мимо') ? 'Мимо' : 'Открыт'}</Stamp> : null}
      {note && !note.startsWith('Мимо') ? <p>{note}</p> : null}
      {challenge ? (
        <LineExercise
          sessionId={challenge.lootboxId}
          words={challenge.words}
          prompt="term"
          totalMs={challenge.maxTimeMs}
          onSubmit={(answers) => void finish(answers)}
          submitting={pending}
        />
      ) : (
        <div className="row">
          <button type="button" disabled={!canBuy || pending} onClick={() => void buy()}>
            {canBuy ? `Купить конверт за ${ECONOMY.lootboxPriceIv} ИВ` : `Нужно ${ECONOMY.lootboxPriceIv} ИВ`}
          </button>
        </div>
      )}
      <ul className="contents">
        {boxes.map((box) => (
          <li key={box.id}>
            <span>{box.status === 'sealed' ? 'Закрыт' : rewardText(box.reward)}</span>
            {box.status === 'sealed' && !challenge ? (
              <button type="button" className="quiet" onClick={() => void open(box.id)}>
                Открыть
              </button>
            ) : (
              <span className="meta">{box.status === 'opened' ? 'вскрыт' : ''}</span>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function rewardText(reward: Reward | null) {
  if (!reward) return 'Пусто'
  if (reward.type === 'skin') return `Скин «${reward.name}»`
  if (reward.type === 'money') return `${reward.amount} денег`
  if (reward.type === 'xp') return `${reward.amount} пунктов уровня`
  if (reward.type === 'subscription_self') return `Подписка на ${reward.days} дней`
  return `Подарок: подписка на ${reward.days} дней`
}
