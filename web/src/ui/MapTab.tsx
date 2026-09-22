import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { hasMePin } from '../core/models'
import { SPORTS, sportById, sportName } from '../core/sports'
import { useApp, useNow } from '../state/context'
import { Avatar, Logo } from './common'
import { formatTimer } from './format'
import { Icon } from './Icon'
import { MapView, type CameraState, type MapViewHandle } from './MapView'
import { MiniProfileSheet, SessionSheet, StartSessionSheet } from './sheets'

/** Fréquence de rafraîchissement du point "ma position" hors session : juste assez pour suivre un déplacement lent,
 * bien plus espacé que l'envoi de position en session (12 s, voir appState.ts) puisque rien n'est diffusé ici. */
const IDLE_LOCATE_INTERVAL_MS = 45_000

export function MapTab({ active, onOpenProfile }: { active: boolean; onOpenProfile: () => void }) {
  const { app, snap } = useApp()
  const mapRef = useRef<MapViewHandle>(null)
  const needleRef = useRef<HTMLSpanElement>(null)
  const [pitched, setPitched] = useState(true) // la carte s'ouvre inclinée (voir FRANCE_VIEW)
  const [profileID, setProfileID] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'start' | 'session' | null>(null)
  const { sportFilter } = snap

  const pins = useMemo(
    () => (sportFilter ? snap.pins.filter((pin) => pin.sportIDs.includes(sportFilter)) : snap.pins),
    [snap.pins, sportFilter],
  )
  // Filtre : les sports présents sur la carte en ce moment, plus les miens (le catalogue en compte une centaine).
  const filterSports = useMemo(() => {
    const present = new Set<string>(snap.me?.sports.map((s) => s.sportID) ?? [])
    for (const pin of snap.pins) for (const id of pin.sportIDs) present.add(id)
    if (sportFilter) present.add(sportFilter)
    return SPORTS.filter((sport) => present.has(sport.id))
  }, [snap.pins, snap.me?.sports, sportFilter])
  const activeNow = useMemo(() => pins.filter((pin) => pin.status === 'active' && !pin.isMe).length, [pins])
  const invisible = snap.me?.visibility.isInvisible === true
  const first = snap.mySessions[0]

  // Point "ma position" : seulement quand aucun pin de session ne me représente déjà (sinon double affichage).
  const locationGranted = snap.location.authorization === 'granted'
  const meCoordinate = hasMePin(pins) ? undefined : snap.location.coordinate

  // Une position fraîche dès que la permission est déjà accordée — jamais de demande d'autorisation automatique ici,
  // seule une action explicite ailleurs (bouton "Me localiser", session, onboarding) la déclenche la première fois.
  useEffect(() => {
    if (!active || snap.mySessions.length > 0 || !locationGranted) return
    void app.locateMe()
    const id = setInterval(() => void app.locateMe(), IDLE_LOCATE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [active, app, snap.mySessions.length, locationGranted])

  async function locateMe() {
    const coordinate = await app.locateMe()
    if (coordinate) mapRef.current?.flyTo(coordinate)
    else if (app.location.isDenied) app.setError("La localisation est refusée : autorise-la dans les réglages de ton navigateur pour te localiser.")
    else app.setError("Position indisponible. Réessaie, ou simule une position dans Profil → Outils de démo.")
  }

  // La boussole tourne à chaque image : on touche directement au DOM plutôt que de re-rendre tout l'onglet.
  const onCameraChange = useCallback(({ bearing, pitch }: CameraState) => {
    needleRef.current?.style.setProperty('transform', `rotate(${-bearing}deg)`)
    setPitched(pitch > 10)
  }, [])

  return (
    <div className="map-tab">
      <MapView
        ref={mapRef}
        pins={pins}
        highlightedSport={sportFilter}
        active={active}
        onPinClick={(pin) => (pin.isMe ? setSheet('session') : setProfileID(pin.userID))}
        onCameraChange={onCameraChange}
        myCoordinate={meCoordinate}
      />

      <div className="map-top">
        <div className="map-top-row">
          <button className="map-btn" aria-label="Revoir toute la France" onClick={() => mapRef.current?.resetFrance()}>
            <Icon name="globe" size={22} />
          </button>
          <Logo compact />
          <button className="map-me" aria-label="Mon profil" onClick={onOpenProfile}>
            <Avatar name={snap.me?.firstName ?? '?'} photo={snap.me?.photoData} size={42} />
            <span className={`map-me-status${invisible ? ' off' : ''}`} aria-hidden="true">
              <Icon name={invisible ? 'eyeOff' : 'check'} size={10} />
            </span>
          </button>
        </div>

        <div className="chips" role="group" aria-label="Filtrer par sport">
          <button className="chip" aria-pressed={sportFilter === undefined} onClick={() => app.setSportFilter(undefined)}>
            Tous
          </button>
          {filterSports.map((sport) => (
            <button
              key={sport.id}
              className="chip"
              aria-pressed={sportFilter === sport.id}
              onClick={() => app.setSportFilter(sportFilter === sport.id ? undefined : sport.id)}
            >
              <span aria-hidden="true">{sport.emoji}</span> {sport.name}
            </button>
          ))}
        </div>
      </div>

      <div className="map-controls">
        <button className="map-btn" aria-label="Remettre le nord en haut" onClick={() => mapRef.current?.resetNorth()}>
          <span className="compass-needle" ref={needleRef}>
            <CompassIcon />
          </span>
        </button>
        <button
          className={`map-btn${pitched ? ' on' : ''}`}
          aria-label={pitched ? 'Passer à la vue à plat' : 'Passer à la vue relief'}
          aria-pressed={pitched}
          onClick={() => mapRef.current?.togglePitch()}
        >
          <Icon name="mountain" size={22} />
        </button>
        <button className="map-btn" aria-label="Me localiser" onClick={() => void locateMe()}>
          <Icon name="locate" size={23} />
        </button>
      </div>

      <div className="live-card" aria-live="polite">
        <span className="live-card-label">
          <span className="live-dot" /> En direct
        </span>
        <span className="live-card-count">
          {activeNow === 0 ? 'Aucun sportif actif' : `${activeNow} sportif${activeNow > 1 ? 's' : ''} actif${activeNow > 1 ? 's' : ''}`}
        </span>
        <span className="live-card-sub">{sportFilter ? sportName(sportFilter) : 'sur toute la carte'}</span>
      </div>

      <div className="dock">
        <span className="dock-grabber" aria-hidden="true" />
        <div className="dock-label">
          <span>{first ? 'Session en cours' : 'Ma session'}</span>
          <button
            className={`dock-status${invisible ? ' off' : ''}`}
            aria-pressed={invisible}
            aria-label={invisible ? 'Invisible : toucher pour redevenir visible' : 'Visible : toucher pour devenir invisible'}
            onClick={() => app.setVisibility({ isInvisible: !invisible })}
          >
            <Icon name={invisible ? 'eyeOff' : 'eye'} size={15} />
            {invisible ? 'Invisible' : 'Visible'}
          </button>
        </div>

        {first ? (
          <LiveSession
            sportID={first.sportID}
            count={snap.mySessions.length}
            startedAt={first.startedAt}
            onClick={() => setSheet('session')}
          />
        ) : (
          <div className="dock-row">
            <div>
              <p className="dock-title">Prêt à bouger ?</p>
              <p className="dock-sub">Apparais sur la carte le temps d'une session.</p>
            </div>
            <button className="btn btn-primary" onClick={() => setSheet('start')}>
              <Icon name="play" size={16} filled /> Démarrer une session
            </button>
          </div>
        )}
      </div>

      {profileID && <MiniProfileSheet userID={profileID} onClose={() => setProfileID(null)} />}
      {sheet === 'start' && <StartSessionSheet onClose={() => setSheet(null)} />}
      {sheet === 'session' && <SessionSheet onClose={() => setSheet(null)} />}
    </div>
  )
}

/** La session en cours : sport, éventuelles autres sessions, et chronomètre (le panneau entier ouvre la fiche de session). */
function LiveSession({ sportID, count, startedAt, onClick }: { sportID: string; count: number; startedAt: number; onClick: () => void }) {
  const now = useNow()
  return (
    <button className="dock-live" onClick={onClick}>
      <span className="sport-emoji" aria-hidden="true">
        {sportById(sportID)?.emoji}
      </span>
      <span className="dock-live-name">
        {sportName(sportID)}
        {count > 1 && <small>+ {count - 1} autre{count > 2 ? 's' : ''} session{count > 2 ? 's' : ''}</small>}
      </span>
      <span className="dock-timer">{formatTimer(now - startedAt)}</span>
      <Icon name="chevronRight" size={18} />
    </button>
  )
}

/** Boussole : flèche rouge vers le nord et « N ». Tourne avec la carte (voir `onCameraChange`). */
function CompassIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" focusable="false">
      <path d="M13 2.5 17.2 11H8.8z" fill="#ff453a" />
      <text x="13" y="23" textAnchor="middle" fontSize="11.5" fontWeight="800" fill="currentColor" fontFamily="inherit">
        N
      </text>
    </svg>
  )
}
