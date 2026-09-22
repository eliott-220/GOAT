import { useApp, useNow } from '../state/context'
import { PageHead, Panel } from './common'
import { describeFeedItem } from './feedFormat'
import { formatRelative } from './format'
import { Icon } from './Icon'

/**
 * Actualité : ce que ton réseau a fait récemment — records personnels (une session qui bat toutes les précédentes
 * du même sport, ou une étape franchie), sessions en cours, Alliances formées, tribus créées. Tout est dérivé de
 * données déjà là (voir PresenceBackend.feed) : rien n'est inventé, il n'y a pas de classement ni de chrono de piste.
 */
export function ActualiteTab() {
  const { snap } = useApp()
  const now = useNow(30_000)

  return (
    <>
      <PageHead title="Actualité" />
      {snap.feed.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Icon name="activity" size={40} /></div>
          <p className="empty-title">Rien à signaler</p>
          <p>Les nouveaux records, sessions et Alliances de ton réseau apparaîtront ici.</p>
        </div>
      ) : (
        <Panel title="Récent">
          {snap.feed.map((item) => {
            const { icon, tone, title, subtitle } = describeFeedItem(item)
            return (
              <div className="activity-row" key={item.id}>
                <span className={`feed-icon tone-bg-${tone}`} aria-hidden="true">
                  <Icon name={icon} size={18} filled={icon === 'trophy' || icon === 'star'} />
                </span>
                <span className="activity-text">
                  {title}
                  {subtitle && <small>{subtitle}</small>}
                </span>
                <span className="activity-when">{formatRelative(item.at, now)}</span>
              </div>
            )
          })}
        </Panel>
      )}
    </>
  )
}
