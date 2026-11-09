import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth.tsx'
import { ECONOMY, GAMES, SKINS, levelFromXp } from '../domain.ts'
import { useFault } from '../i18n/fault.ts'
import { gameName, skinName } from '../i18n/labels.ts'
import { callApi } from '../lib/api.ts'
import { formatWhen } from '../lib/words.ts'

export function DeskPage() {
  const { t, i18n } = useTranslation()
  const { profile, refresh } = useAuth()
  const [giftName, setGiftName] = useState('')
  const fault = useFault()
  if (!profile) return null
  const wornSkin = SKINS.find((skin) => skin.id === profile.equipped_skin_id)
  const skinLabel = wornSkin ? skinName(t, wornSkin.id, wornSkin.name) : ''

  async function equip(skinId: string | null) {
    fault.clear()
    try {
      await callApi({ action: 'equip-skin', skinId })
      await refresh()
    } catch (caught) {
      fault.caught(caught, 'desk.equipFailed')
    }
  }

  async function gift(itemId: string) {
    fault.clear()
    try {
      await callApi({ action: 'gift-subscription', itemId, toName: giftName.trim() })
      setGiftName('')
      await refresh()
    } catch (caught) {
      fault.caught(caught, 'desk.giftFailed')
    }
  }

  return (
    <>
      <p className="eyebrow">{t('desk.eyebrow')}</p>
      <div className="grades">
        <span className="grade">{t('desk.iv', { iv: profile.iv })}</span>
        <span className="grade">{t('desk.money', { money: profile.money })}</span>
        <span className="grade">{t('desk.level', { level: levelFromXp(profile.xp) })}</span>
      </div>
      <p className="cover-line">
        {profile.subscription_until
          ? t('desk.subscribed', { date: formatWhen(profile.subscription_until, i18n.language) })
          : t('desk.unsubscribed')}
      </p>
      <p className="meta">{skinLabel ? t('desk.skinOn', { name: skinLabel }) : t('desk.skinOff')}</p>
      {fault.text ? <p className="error-line" role="alert">{fault.text}</p> : null}
      {profile.items.some((item) => item.kind === 'skin') ? (
        <div className="row">
          {profile.items
            .filter((item) => item.kind === 'skin')
            .map((item) => {
              const known = SKINS.find((skin) => skin.id === item.skin_id)
              const name = item.skin_id ? skinName(t, item.skin_id, known?.name ?? item.skin_id) : item.skin_id
              const worn = profile.equipped_skin_id === item.skin_id
              return (
                <button key={item.id} type="button" className="quiet" onClick={() => void equip(worn ? null : item.skin_id)}>
                  {worn ? t('desk.takeOff', { name }) : t('desk.putOn', { name })}
                </button>
              )
            })}
        </div>
      ) : null}
      {profile.items.some((item) => item.kind === 'subscription_gift') ? (
        <form className="sheet" onSubmit={(event) => event.preventDefault()}>
          <label className="label" htmlFor="gift">{t('desk.giftLabel')}</label>
          <input id="gift" className="plain-input" value={giftName} onChange={(event) => setGiftName(event.target.value)} />
          <div className="row">
            {profile.items
              .filter((item) => item.kind === 'subscription_gift')
              .map((item) => (
                <button key={item.id} type="button" disabled={!giftName.trim()} onClick={() => void gift(item.id)}>
                  {t('desk.giftDays', { count: item.days ?? 0 })}
                </button>
              ))}
          </div>
        </form>
      ) : null}
      <ul className="contents">
        {GAMES.map((game) => {
          const free = profile.iv < game.costIv
          return (
            <li key={game.id}>
              <Link to={`/play/${game.id}`}>{gameName(t, game.id, game.name)}</Link>
              <span className="meta">
                {free ? t('desk.free') : t('desk.cost', { iv: game.costIv })}
                {game.modes.includes('multi') ? t('desk.together') : ''}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="meta">{t('desk.lootboxHint', { iv: ECONOMY.lootboxPriceIv })}</p>
    </>
  )
}
