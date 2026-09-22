import { useEffect, useState } from 'react'
import { sportName } from '../core/sports'
import type { PersonSuggestion, User } from '../core/models'
import { userSportIDs } from '../core/models'
import { useApp } from '../state/context'
import { Avatar, PageHead, Panel, Sheet } from './common'
import { Icon } from './Icon'
import { PeopleSheet } from './PeopleSheet'
import { MiniProfileSheet } from './sheets'
import { SportIllustration } from './SportIllustration'

export function AlliancesTab() {
  const { app, snap } = useApp()
  const [profileID, setProfileID] = useState<string | null>(null)
  const [newTribu, setNewTribu] = useState(false)
  const [people, setPeople] = useState<'following' | 'followers' | 'discover' | null>(null)
  const [suggestions, setSuggestions] = useState<PersonSuggestion[]>([])
  const { alliances, tribus, follow } = snap

  useEffect(() => {
    let cancelled = false
    void app.suggestedPeople().then((result) => { if (!cancelled) setSuggestions(result) })
    return () => { cancelled = true }
  }, [app, snap.alliances, snap.follow])

  const linkedIDs = new Set([
    ...alliances.allies.map((entry) => entry.other.id),
    ...alliances.incoming.map((entry) => entry.other.id),
    ...alliances.outgoing.map((entry) => entry.other.id),
  ])
  const discover = suggestions.filter(({ user }) => !linkedIDs.has(user.id)).slice(0, 3)

  const person = (user: User) => (
    <button className="row-button person" onClick={() => setProfileID(user.id)}>
      <Avatar name={user.firstName} photo={user.photoData} size={40} />
      <span className="row-main">
        <span className="row-title">{user.firstName}</span>
        <span className="row-sub">{userSportIDs(user).map(sportName).join(' · ')}</span>
      </span>
    </button>
  )

  return (
    <div className="editorial-page alliances-page">
      <PageHead
        title="Alliances"
        action={
          <button className="icon-btn big" aria-label="Nouvelle tribu" onClick={() => setNewTribu(true)}>
            <Icon name="plus" />
          </button>
        }
      />

      <p className="page-intro">Retrouve les sportifs avec qui tu as choisi de garder le lien.</p>

      <div className="alliance-actions">
        <button className="alliance-action" onClick={() => setPeople('discover')}>
          <span className="alliance-action-icon"><Icon name="search" size={20} /></span>
          <span>Découvrir des sportifs<small>Rencontres par sport en commun</small></span>
          <Icon name="chevronRight" size={18} />
        </button>
      </div>

      <Panel
        title="Mon réseau"
        action={
          <button className="link-btn" onClick={() => setPeople('discover')}>
            Explorer
          </button>
        }
      >
        <button className="row row-button" onClick={() => setPeople('following')}>
          <span className="row-main">
            <span className="row-title">{follow.following.length} abonnement{follow.following.length !== 1 ? 's' : ''}</span>
          </span>
          <Icon name="chevronRight" size={18} />
        </button>
        <button className="row row-button" onClick={() => setPeople('followers')}>
          <span className="row-main">
            <span className="row-title">{follow.followers.length} abonné{follow.followers.length !== 1 ? 's' : ''}</span>
          </span>
          <Icon name="chevronRight" size={18} />
        </button>
      </Panel>

      {alliances.incoming.length > 0 && (
        <Panel title="Demandes reçues" count={alliances.incoming.length}>
          {alliances.incoming.map((entry) => (
            <div className="row" key={entry.alliance.id}>
              {person(entry.other)}
              <button className="round ok" aria-label={`Accepter ${entry.other.firstName}`} onClick={() => void app.respondToAlliance(entry.alliance.id, true)}>
                <Icon name="check" size={18} />
              </button>
              <button className="round" aria-label={`Refuser ${entry.other.firstName}`} onClick={() => void app.respondToAlliance(entry.alliance.id, false)}>
                <Icon name="x" size={18} />
              </button>
            </div>
          ))}
        </Panel>
      )}

      <Panel title="Mes Alliés" count={alliances.allies.length} className="allies-card">
        {alliances.allies.length === 0 && <p className="row-empty">Pas encore d'Alliance. Touche un pin de la carte ou un Echo pour en demander une.</p>}
        {alliances.allies.map((entry) => (
          <div className="row" key={entry.alliance.id}>
            {person(entry.other)}
          </div>
        ))}
      </Panel>

      {discover.length > 0 && (
        <Panel title="À découvrir" action={<button className="link-btn" onClick={() => setPeople('discover')}>Voir tout</button>} className="allies-card">
          {discover.map(({ user, sharedSportID }) => (
            <div className="row suggestion-row" key={user.id}>
              {person(user)}
              {sharedSportID && <span className="suggestion-sport" title={`Sport en commun : ${sportName(sharedSportID)}`}><SportIllustration sportID={sharedSportID} className="sport-art-inline" /></span>}
              <button className="btn btn-primary btn-small" onClick={() => void app.requestAlliance(user.id)}><Icon name="plus" size={15} /> Alliance</button>
            </div>
          ))}
        </Panel>
      )}

      {alliances.outgoing.length > 0 && (
        <Panel title="Demandes envoyées" count={alliances.outgoing.length}>
          {alliances.outgoing.map((entry) => (
            <div className="row" key={entry.alliance.id}>
              {person(entry.other)}
              <span className="row-note">En attente</span>
            </div>
          ))}
        </Panel>
      )}

      <Panel title="Mes tribus" count={tribus.mine.length}>
        {tribus.mine.length === 0 && <p className="row-empty">Tu n'as rejoint aucune tribu.</p>}
        {tribus.mine.map((tribu) => (
          <div className="row" key={tribu.id}>
            <span className="tribu-icon" aria-hidden="true"><Icon name="people" size={20} /></span>
            <div className="row-main">
              <div className="row-title">{tribu.name}</div>
              <div className="row-sub">
                {tribu.memberIDs.length} membre{tribu.memberIDs.length > 1 ? 's' : ''}
              </div>
            </div>
            <button className="btn btn-small btn-danger" onClick={() => void app.leaveTribu(tribu.id)}>
              Quitter
            </button>
          </div>
        ))}
      </Panel>

      {tribus.discover.length > 0 && (
        <Panel title="Tribus à rejoindre" count={tribus.discover.length}>
          {tribus.discover.map((tribu) => (
            <div className="row" key={tribu.id}>
              <span className="tribu-icon" aria-hidden="true"><Icon name="people" size={20} /></span>
              <div className="row-main">
                <div className="row-title">{tribu.name}</div>
              </div>
              <button className="btn btn-small" onClick={() => void app.joinTribu(tribu.id)}>
                Rejoindre
              </button>
            </div>
          ))}
        </Panel>
      )}

      {profileID && <MiniProfileSheet userID={profileID} onClose={() => setProfileID(null)} />}
      {newTribu && <NewTribuSheet onClose={() => setNewTribu(false)} />}
      {people && <PeopleSheet initialTab={people} onClose={() => setPeople(null)} />}
    </div>
  )
}

function NewTribuSheet({ onClose }: { onClose: () => void }) {
  const { app } = useApp()
  const [name, setName] = useState('')
  const submit = async () => {
    if (!name.trim()) return
    await app.createTribu(name)
    onClose()
  }
  return (
    <Sheet title="Nouvelle tribu" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <input
          className="input"
          placeholder="Nom de la tribu"
          value={name}
          maxLength={40}
          autoFocus
          enterKeyHint="done"
          onChange={(e) => setName(e.target.value)}
        />
        <div className="actions">
          <button type="submit" className="btn btn-primary btn-block btn-large" disabled={!name.trim()}>
            Créer
          </button>
        </div>
      </form>
    </Sheet>
  )
}
