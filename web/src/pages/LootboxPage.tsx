import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth.tsx'
import { Stamp } from '../components/Marks.tsx'
import { ECONOMY } from '../domain.ts'
import { LineExercise, type TypedAnswer, type WordCard } from '../exercise/exercises.tsx'
import { useFault } from '../i18n/fault.ts'
import { skinName } from '../i18n/labels.ts'
import { callApi } from '../lib/api.ts'
import { supabase } from '../lib/supabase.ts'

type Box = { id: string; status: 'sealed' | 'opened'; reward: Reward | null }
type Reward =
  | { type: 'skin'; skinId: string; name: string }
  | { type: 'money'; amount: number }
  | { type: 'xp'; amount: number }
  | { type: 'subscription_self'; days: number; until: string }
  | { type: 'subscription_gift'; itemId: string; days: number }
type Note = { passed: boolean; reward: Reward | null }

export function LootboxPage() {
  const { t } = useTranslation()
  const { profile, refresh, session } = useAuth()
  const [boxes, setBoxes] = useState<Box[]>([])
  const [challenge, setChallenge] = useState<{ lootboxId: string; words: WordCard[]; maxTimeMs: number } | null>(null)
  const fault = useFault()
  const [pending, setPending] = useState(false)
  const [note, setNote] = useState<Note | null>(null)

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
    fault.clear()
    setPending(true)
    try {
      await callApi({ action: 'lootbox-buy' })
      await refresh()
      await load()
    } catch (caught) {
      fault.caught(caught, 'lootbox.buyFailed')
    } finally {
      setPending(false)
    }
  }

  async function open(lootboxId: string) {
    fault.clear()
    setNote(null)
    try {
      const started = await callApi<{
        lootboxId: string
        limits: { maxTimeMs: number }
        input: { words: WordCard[] }
      }>({ action: 'lootbox-start', lootboxId })
      setChallenge({ lootboxId: started.lootboxId, words: started.input.words, maxTimeMs: started.limits.maxTimeMs })
    } catch (caught) {
      fault.caught(caught, 'lootbox.startFailed')
    }
  }

  async function finish(answers: TypedAnswer[]) {
    if (!challenge) return
    setPending(true)
    fault.clear()
    try {
      const result = await callApi<{ passed: boolean; reward: Reward | null }>({
        action: 'lootbox-finish',
        lootboxId: challenge.lootboxId,
        answers,
      })
      setChallenge(null)
      setNote({ passed: Boolean(result.passed && result.reward), reward: result.reward })
      await refresh()
      await load()
    } catch (caught) {
      fault.caught(caught, 'lootbox.answerFailed')
    } finally {
      setPending(false)
    }
  }

  function rewardText(reward: Reward | null) {
    if (!reward) return t('lootbox.empty')
    if (reward.type === 'skin') return t('lootbox.rewardSkin', { name: skinName(t, reward.skinId, reward.name) })
    if (reward.type === 'money') return t('lootbox.rewardMoney', { amount: reward.amount })
    if (reward.type === 'xp') return t('lootbox.rewardXp', { count: reward.amount })
    if (reward.type === 'subscription_self') return t('lootbox.subscriptionDays', { count: reward.days })
    return t('lootbox.giftDays', { count: reward.days })
  }

  const canBuy = (profile?.iv ?? 0) >= ECONOMY.lootboxPriceIv

  return (
    <>
      <p className="eyebrow">{t('lootbox.eyebrow')}</p>
      <p className="cover-line">{t('lootbox.inside')}</p>
      <p className="meta">
        {t('lootbox.limit', {
          errors: t('lootbox.errorCount', { count: ECONOMY.lootboxMaxErrors }),
          seconds: t('lootbox.secondCount', { count: ECONOMY.lootboxMaxTimeMs / 1000 }),
        })}
      </p>
      {fault.text ? <p className="error-line" role="alert">{fault.text}</p> : null}
      {note ? <Stamp tone={note.passed ? 'ok' : 'bad'}>{note.passed ? t('lootbox.opened') : t('lootbox.missed')}</Stamp> : null}
      {note?.passed ? <p>{rewardText(note.reward)}</p> : null}
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
            {canBuy ? t('lootbox.buy', { iv: ECONOMY.lootboxPriceIv }) : t('lootbox.need', { iv: ECONOMY.lootboxPriceIv })}
          </button>
        </div>
      )}
      <ul className="contents">
        {boxes.map((box) => (
          <li key={box.id}>
            <span>{box.status === 'sealed' ? t('lootbox.sealed') : rewardText(box.reward)}</span>
            {box.status === 'sealed' && !challenge ? (
              <button type="button" className="quiet" onClick={() => void open(box.id)}>
                {t('lootbox.open')}
              </button>
            ) : (
              <span className="meta">{box.status === 'opened' ? t('lootbox.openedMeta') : ''}</span>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
