import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth.tsx'
import { Stamp } from '../components/Marks.tsx'
import { ECONOMY, GAMES, SKINS, levelFromXp } from '../domain.ts'
import { ApiError, callApi } from '../lib/api.ts'
import { formatWhen } from '../lib/words.ts'

export function DeskPage() {
  const { profile, refresh } = useAuth()
  const [giftName, setGiftName] = useState('')
  const [error, setError] = useState('')
  if (!profile) return null
  const skinName = SKINS.find((skin) => skin.id === profile.equipped_skin_id)?.name

  async function equip(skinId: string | null) {
    setError('')
    try {
      await callApi({ action: 'equip-skin', skinId })
      await refresh()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось надеть скин')
    }
  }

  async function gift(itemId: string) {
    setError('')
    try {
      await callApi({ action: 'gift-subscription', itemId, toName: giftName.trim() })
      setGiftName('')
      await refresh()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось подарить подписку')
    }
  }

  return (
    <>
      <p className="eyebrow">Сегодняшняя страница</p>
      <div className="grades">
        <span className="grade">ИВ {profile.iv}</span>
        <span className="grade">деньги {profile.money}</span>
        <span className="grade">уровень {levelFromXp(profile.xp)}</span>
      </div>
      <p className="cover-line">
        {profile.subscription_until
          ? `Подписка до ${formatWhen(profile.subscription_until)}.`
          : 'Подписки нет. Иногда она лежит в конверте.'}
      </p>
      <p className="meta">{skinName ? `На столе: ${skinName}.` : 'Скин не надет.'}</p>
      {error ? <p className="error-line" role="alert">{error}</p> : null}
      {profile.items.some((item) => item.kind === 'skin') ? (
        <div className="row">
          {profile.items
            .filter((item) => item.kind === 'skin')
            .map((item) => {
              const name = SKINS.find((skin) => skin.id === item.skin_id)?.name ?? item.skin_id
              const worn = profile.equipped_skin_id === item.skin_id
              return (
                <button key={item.id} type="button" className="quiet" onClick={() => void equip(worn ? null : item.skin_id)}>
                  {worn ? `Снять ${name}` : `Надеть ${name}`}
                </button>
              )
            })}
        </div>
      ) : null}
      {profile.items.some((item) => item.kind === 'subscription_gift') ? (
        <form className="sheet" onSubmit={(event) => event.preventDefault()}>
          <label className="label" htmlFor="gift">Кому подарить подписку</label>
          <input id="gift" className="plain-input" value={giftName} onChange={(event) => setGiftName(event.target.value)} />
          <div className="row">
            {profile.items
              .filter((item) => item.kind === 'subscription_gift')
              .map((item) => (
                <button key={item.id} type="button" disabled={!giftName.trim()} onClick={() => void gift(item.id)}>
                  Подарить {item.days} дней
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
              <Link to={`/play/${game.id}`}>{game.name}</Link>
              <span className="meta">
                {free ? 'бесплатно' : `${game.costIv} ИВ`}
                {game.modes.includes('multi') ? ' · можно вместе' : ''}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="meta">Конверт стоит {ECONOMY.lootboxPriceIv} ИВ. Открывается коротким упражнением.</p>
    </>
  )
}
