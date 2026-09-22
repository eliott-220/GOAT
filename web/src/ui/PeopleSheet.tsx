import { useEffect, useState } from 'react'
import type { PersonSuggestion, User } from '../core/models'
import { userSportIDs } from '../core/models'
import { sportById, sportName } from '../core/sports'
import { useApp } from '../state/context'
import { Avatar, Panel, Sheet } from './common'
import { Icon } from './Icon'
import { MiniProfileSheet } from './sheets'

type PeopleTab = 'following' | 'followers' | 'discover'

const TABS: { id: PeopleTab; label: string }[] = [
  { id: 'following', label: 'Abonnements' },
  { id: 'followers', label: 'Abonnés' },
  { id: 'discover', label: 'Découvrir' },
]

/** Pourquoi cette personne est suggérée, ou à défaut ses sports (même convention que les autres listes de contacts). */
function reason(user: User, sharedSportID?: string): string {
  if (sharedSportID) {
    const sport = sportById(sharedSportID)
    return sport ? `Pratique aussi ${sport.name.toLowerCase()}` : ''
  }
  const sports = userSportIDs(user).map(sportName)
  return sports.length > 0 ? sports.join(' · ') : 'Nouveau sur GOAT'
}

/**
 * Le réseau : qui je suis, qui me suit, et une découverte de nouvelles personnes à suivre (recherche + suggestions
 * par sport en commun) — le suivi est instantané, sans demande ni acceptation, à la différence d'une Alliance.
 */
export function PeopleSheet({ initialTab, onClose }: { initialTab: PeopleTab; onClose: () => void }) {
  const { app, snap } = useApp()
  const [tab, setTab] = useState<PeopleTab>(initialTab)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<PersonSuggestion[]>([])
  const [results, setResults] = useState<User[]>([])
  const [profileID, setProfileID] = useState<string | null>(null)
  const { following, followers } = snap.follow

  useEffect(() => {
    if (tab !== 'discover') return
    let cancelled = false
    const trimmed = query.trim()
    if (trimmed) void app.searchPeople(trimmed).then((r) => !cancelled && setResults(r))
    else void app.suggestedPeople().then((r) => !cancelled && setSuggestions(r))
    return () => {
      cancelled = true
    }
  }, [tab, query, app, snap.follow])

  const followToggle = (user: User, isFollowing: boolean) => (
    <button
      className={`btn btn-small${isFollowing ? '' : ' btn-outline'}`}
      onClick={() => void (isFollowing ? app.unfollowUser(user.id) : app.followUser(user.id))}
    >
      <Icon name={isFollowing ? 'check' : 'plus'} size={14} />
      {isFollowing ? 'Abonné·e' : 'Suivre'}
    </button>
  )

  const personRow = (user: User, sub: string, action: React.ReactNode) => (
    <div className="row" key={user.id}>
      <button className="row-button person" onClick={() => setProfileID(user.id)}>
        <Avatar name={user.firstName} photo={user.photoData} size={40} />
        <span className="row-main">
          <span className="row-title">{user.firstName}</span>
          <span className="row-sub">{sub}</span>
        </span>
      </button>
      {action}
    </div>
  )

  return (
    <Sheet title="Réseau" onClose={onClose}>
      <div className="segmented" role="tablist" aria-label="Réseau">
        {TABS.map(({ id, label }) => (
          <button key={id} className="segmented-item" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'following' && (
        <Panel title="Abonnements" count={following.length}>
          {following.length === 0 && <p className="row-empty">Tu ne suis encore personne. Va voir « Découvrir ».</p>}
          {following.map((user) => personRow(user, userSportIDs(user).map(sportName).join(' · '), followToggle(user, true)))}
        </Panel>
      )}

      {tab === 'followers' && (
        <Panel title="Abonnés" count={followers.length}>
          {followers.length === 0 && <p className="row-empty">Personne ne te suit encore.</p>}
          {followers.map((user) => {
            const alreadyFollowing = following.some((f) => f.id === user.id)
            return personRow(user, userSportIDs(user).map(sportName).join(' · '), followToggle(user, alreadyFollowing))
          })}
        </Panel>
      )}

      {tab === 'discover' && (
        <>
          <div className="sport-search">
            <div className="search-field">
              <Icon name="search" size={18} />
              <input
                className="input"
                type="search"
                aria-label="Rechercher une personne"
                placeholder="Rechercher un prénom"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <Panel title={query.trim() ? 'Résultats' : 'Suggestions'}>
            {query.trim() && results.length === 0 && <p className="row-empty">Personne ne porte ce prénom.</p>}
            {!query.trim() && suggestions.length === 0 && <p className="row-empty">Plus personne à suggérer pour l'instant.</p>}
            {(query.trim() ? results.map((user): PersonSuggestion => ({ user })) : suggestions).map(({ user, sharedSportID }) =>
              personRow(user, reason(user, sharedSportID), followToggle(user, following.some((f) => f.id === user.id))),
            )}
          </Panel>
        </>
      )}

      {profileID && <MiniProfileSheet userID={profileID} onClose={() => setProfileID(null)} />}
    </Sheet>
  )
}
