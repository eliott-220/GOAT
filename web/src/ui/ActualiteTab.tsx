import { useState } from 'react'
import type { FeedItem } from '../core/models'
import { sportName } from '../core/sports'
import { useApp, useNow } from '../state/context'
import { PageHead } from './common'
import { describeFeedItem } from './feedFormat'
import { formatRelative } from './format'
import { Icon } from './Icon'
import { SportIllustration } from './SportIllustration'

type FeedFilter = 'all' | 'sessions' | 'records' | 'network'
const FILTERS: { id: FeedFilter; label: string }[] = [
  { id: 'all', label: 'Tout' }, { id: 'sessions', label: 'Sessions' },
  { id: 'records', label: 'Records' }, { id: 'network', label: 'Réseau' },
]

function matchesFilter(item: FeedItem, filter: FeedFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'sessions') return item.kind === 'newSession'
  if (filter === 'records') return item.kind === 'record'
  return item.kind === 'allianceFormed' || item.kind === 'tribuCreated'
}

function eventLabel(item: FeedItem): string {
  switch (item.kind) {
    case 'record': return 'Record'
    case 'newSession': return 'En direct'
    case 'allianceFormed': return 'Alliance'
    case 'tribuCreated': return 'Tribu'
  }
}

/** Fil des événements réellement issus du backend, présenté comme des cartes éditoriales. */
export function ActualiteTab() {
  const { snap } = useApp()
  const now = useNow(30_000)
  const [filter, setFilter] = useState<FeedFilter>('all')
  const items = snap.feed.filter((item) => matchesFilter(item, filter))

  return (
    <div className="editorial-page">
      <PageHead title="Actualité" />
      <p className="page-intro">Les moments de ton réseau, au rythme des sportifs.</p>
      <div className="feed-filters" role="group" aria-label="Filtrer les actualités">
        {FILTERS.map(({ id, label }) => (
          <button key={id} className="feed-filter" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      <div className="feed-heading"><span>{filter === 'all' ? 'Fil récent' : FILTERS.find((entry) => entry.id === filter)?.label}</span><small>{items.length}</small></div>
      {items.length === 0 ? (
        <div className="empty feed-empty">
          <div className="empty-icon"><Icon name="activity" size={36} /></div>
          <p className="empty-title">Rien à signaler pour le moment</p>
          <p>Les nouvelles sessions, les records et les Alliances de ton réseau apparaîtront ici.</p>
        </div>
      ) : (
        <div className="feed-list">
          {items.map((item) => {
            const { icon, tone, title, subtitle } = describeFeedItem(item)
            const sportID = 'sportID' in item ? item.sportID : undefined
            return (
              <article className={`feed-card tone-${tone}`} key={item.id}>
                <span className="feed-card-icon" aria-hidden="true"><Icon name={icon} size={23} /></span>
                <div className="feed-card-content">
                  <div className="feed-card-meta"><strong>{eventLabel(item)}</strong><span>·</span><time>{formatRelative(item.at, now)}</time></div>
                  <h2>{title}</h2>
                  {subtitle && <p>{subtitle}</p>}
                  {sportID && <div className="feed-card-sport"><SportIllustration sportID={sportID} className="sport-art-inline" />{sportName(sportID)}</div>}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
