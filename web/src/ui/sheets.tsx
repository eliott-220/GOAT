import { useCallback, useEffect, useState } from 'react'
import { sessionDuration, type MiniProfile } from '../core/models'
import { sportById, sportColor, sportName } from '../core/sports'
import { useApp, useNow } from '../state/context'
import { Avatar, Panel, Sheet, SportHexes, Switch } from './common'
import { formatMonthYearShort, formatTimer } from './format'
import { Icon } from './Icon'

export function StartSessionSheet({ onClose }: { onClose: () => void }) {
  const { app, snap } = useApp()
  const me = snap.me
  if (!me) return null
  const running = new Set(snap.mySessions.map((s) => s.sportID))
  const ordered = [...me.sports].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  const linger = me.visibility.lingerMinutes
  const after = linger === 0 ? "Tu disparais dès l'arrêt." : `Tu restes visible ${linger} min après l'arrêt.`

  return (
    <Sheet title="Nouvelle session" onClose={onClose}>
      <Panel title="Quel sport ?">
        {ordered.map(({ sportID, isPrimary }) => {
          const sport = sportById(sportID)
          if (!sport) return null
          const isRunning = running.has(sportID)
          return (
            <button
              key={sportID}
              className="row row-button"
              disabled={isRunning}
              onClick={async () => {
                await app.startSession(sportID)
                onClose()
              }}
            >
              <span className="sport-emoji" style={{ background: `${sportColor(sportID)}26` }} aria-hidden="true">
                {sport.emoji}
              </span>
              <span className="row-title">{sport.name}</span>
              {isPrimary && <span className="primary-star" aria-label="Sport principal"><Icon name="star" size={16} filled /></span>}
              <span className="spacer" />
              {isRunning ? <span className="row-note">En cours</span> : <Icon name="chevronRight" size={18} />}
            </button>
          )
        })}
      </Panel>
      <p className="footnote">
        Tu apparais sur la carte avec une position approximative (~150 m), jamais exacte. {after} Tu peux te rendre invisible à tout moment.
      </p>
    </Sheet>
  )
}

export function SessionSheet({ onClose }: { onClose: () => void }) {
  const { app, snap } = useApp()
  const now = useNow()
  const me = snap.me
  const { authorization, coordinate } = snap.location

  return (
    <Sheet title="Session" onClose={onClose}>
      {snap.mySessions.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Aucune session en cours</p>
          <p>Démarre une session pour apparaître sur la carte.</p>
        </div>
      ) : (
        <>
          <Panel title="En cours" count={snap.mySessions.length}>
            {snap.mySessions.map((session) => (
              <div className="row" key={session.id}>
                <span className="sport-emoji" style={{ background: `${sportColor(session.sportID)}26` }} aria-hidden="true">
                  {sportById(session.sportID)?.emoji}
                </span>
                <div className="row-main">
                  <div className="row-title">{sportName(session.sportID)}</div>
                  <div className="row-sub tabular">{formatTimer(sessionDuration(session, now))}</div>
                </div>
                <button
                  className="btn btn-small btn-danger"
                  onClick={async () => {
                    await app.stopSession(session.id)
                    if (app.getSnapshot().mySessions.length === 0) onClose()
                  }}
                >
                  Arrêter
                </button>
              </div>
            ))}
          </Panel>

          <div className="card spaced">
            <div className="row">
              <Icon name="eyeOff" size={20} />
              <div className="row-main">
                <div className="row-title">Mettre ma visibilité en pause</div>
              </div>
              <Switch
                label="Mettre ma visibilité en pause"
                checked={me?.visibility.isInvisible ?? false}
                onChange={(value) => app.setVisibility({ isInvisible: value })}
              />
            </div>
          </div>
          <p className="footnote">Ta session continue, mais personne ne te voit sur la carte tant que c'est activé.</p>

          {authorization === 'denied' && (
            <p className="notice warn">La localisation est refusée : tu n'apparais pas sur la carte. Autorise-la dans les réglages de ton navigateur.</p>
          )}
          {authorization === 'unsupported' && <p className="notice warn">Ce navigateur ne propose pas la géolocalisation.</p>}
          {authorization === 'unknown' && (
            <div className="spaced">
              <button className="btn btn-block" onClick={() => void app.location.requestPermission()}>
                Autoriser la localisation
              </button>
              <p className="footnote">Sans position, ta session est active mais tu n'apparais pas sur la carte.</p>
            </div>
          )}
          {authorization === 'granted' && !coordinate && (
            <p className="notice">
              <span className="spinner" aria-hidden="true" /> Recherche de ta position…
            </p>
          )}
          {app.supportsDemoTools && authorization !== 'granted' && (
            <p className="footnote">Démo : tu peux simuler une position dans Profil → Outils de démo.</p>
          )}
        </>
      )}
    </Sheet>
  )
}

const REPORT_REASONS = ['Comportement inapproprié', 'Faux profil', 'Spam', 'Autre']

/** Mini-profil affiché au tap sur un pin, une suggestion Echo ou un contact. Ne montre jamais de position. */
export function MiniProfileSheet({ userID, onClose }: { userID: string; onClose: () => void }) {
  const { app, snap } = useApp()
  const [profile, setProfile] = useState<MiniProfile | undefined>()
  const [loaded, setLoaded] = useState(false)
  const [panel, setPanel] = useState<'none' | 'report' | 'block' | 'reported'>('none')

  const load = useCallback(async () => {
    setProfile(await app.profile(userID))
    setLoaded(true)
  }, [app, userID])

  // Recharge aussi quand les Alliances changent ailleurs (ex. l'autre personne accepte pendant que la fiche est ouverte).
  useEffect(() => {
    void load()
  }, [load, snap.alliances])

  const act = async (action: () => Promise<void>) => {
    await action()
    await load()
  }

  return (
    <Sheet title="Profil" onClose={onClose}>
      {!profile ? (
        <div className="empty">{loaded ? <p className="empty-title">Profil indisponible</p> : <span className="spinner" aria-label="Chargement" />}</div>
      ) : (
        <div className="mini-profile">
          <div className="mini-head">
            <Avatar name={profile.firstName} photo={profile.photoData} size={92} ring />
            <div className="mini-id">
              <h2 className="mini-name">{profile.firstName}</h2>
              {profile.currentSportIDs.length > 0 && (
                <p className="now-playing">
                  <span className="live-dot" /> En ce moment : {profile.currentSportIDs.map(sportName).join(', ')}
                </p>
              )}
              <p className="member-since">Membre depuis {formatMonthYearShort(profile.memberSince)}</p>
            </div>
          </div>
          {profile.bio && <p className="mini-bio">{profile.bio}</p>}

          <div className="actions">
            {profile.relation.kind === 'none' && (
              <button className="btn btn-outline btn-block btn-large" onClick={() => void act(() => app.requestAlliance(profile.id))}>
                <Icon name="star" size={18} /> Demander en Alliance
              </button>
            )}
            {profile.relation.kind === 'requestSent' && (
              <p className="status-line"><Icon name="clock" size={18} /> Demande envoyée</p>
            )}
            {profile.relation.kind === 'requestReceived' && (
              <div className="btn-row">
                <button className="btn btn-primary btn-large" onClick={() => void act(() => app.respondToAlliance((profile.relation as { allianceID: string }).allianceID, true))}>
                  Accepter
                </button>
                <button className="btn btn-large" onClick={() => void act(() => app.respondToAlliance((profile.relation as { allianceID: string }).allianceID, false))}>
                  Refuser
                </button>
              </div>
            )}
            {profile.relation.kind === 'allied' && <p className="status-line ok"><Icon name="people" size={18} /> Alliés</p>}
          </div>

          <Panel title="Sports pratiqués" count={profile.sportIDs.length} className="spaced">
            <SportHexes items={profile.sportIDs.map((sportID) => ({ sportID }))} />
          </Panel>

          {panel === 'none' && (
            <div className="btn-row subtle">
              <button className="btn btn-plain" onClick={() => setPanel('report')}>
                <Icon name="flag" size={16} /> Signaler
              </button>
              <button className="btn btn-plain btn-danger" onClick={() => setPanel('block')}>
                <Icon name="ban" size={16} /> Bloquer
              </button>
            </div>
          )}
          {panel === 'report' && (
            <div className="card spaced full">
              <div className="row"><strong>Pourquoi signaler ce profil ?</strong></div>
              {REPORT_REASONS.map((reason) => (
                <button
                  key={reason}
                  className="row row-button"
                  onClick={async () => {
                    await app.report(profile.id, reason)
                    setPanel('reported')
                  }}
                >
                  {reason}
                </button>
              ))}
              <button className="row row-button muted" onClick={() => setPanel('none')}>Annuler</button>
            </div>
          )}
          {panel === 'reported' && <p className="notice">Merci, ton signalement est enregistré.</p>}
          {panel === 'block' && (
            <div className="card spaced full">
              <div className="row">
                <div>
                  <strong>Bloquer {profile.firstName} ?</strong>
                  <div className="row-sub wrap">Vous ne vous verrez plus sur la carte ni dans les Echos, et toute Alliance sera rompue.</div>
                </div>
              </div>
              <button
                className="row row-button danger-text"
                onClick={async () => {
                  await app.block(profile.id)
                  onClose()
                }}
              >
                Bloquer
              </button>
              <button className="row row-button muted" onClick={() => setPanel('none')}>Annuler</button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
