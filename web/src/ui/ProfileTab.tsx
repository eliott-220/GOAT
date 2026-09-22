import { useEffect, useMemo, useRef, useState } from 'react'
import { athleteStyleById } from '../core/athleteStyles'
import { DEMO_HUBS } from '../core/demo'
import { LINGER_OPTIONS, VISIBILITY_LABELS, primarySportID, sessionDuration, type VisibilityScope } from '../core/models'
import { ageProblem, parseAge } from '../core/profileRules'
import { sportById, sportColor, sportName } from '../core/sports'
import { sessionsPerSport, summarizeActivity } from '../core/stats'
import { useApp, useNow } from '../state/context'
import { Avatar, Panel, SportHexes, Switch } from './common'
import { formatDayTime, formatDuration, formatMonthYearShort, formatPractice, formatRelative } from './format'
import { Icon, type IconName } from './Icon'
import { AthleteStylePicker } from './ProfileFields'
import { SportSelection } from './SportSelection'

const BIO_LIMIT = 140

const ageToText = (age?: number): string => (age === undefined ? '' : String(age))

type View = 'main' | 'sports' | 'visibility'

/** Réduit une photo à `maxPixel` px de côté max et l'encode en JPEG (photo de profil légère). */
async function toAvatarDataURL(file: File, maxPixel = 400): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Image illisible'))
      img.src = url
    })
    const scale = Math.min(1, maxPixel / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.8)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function ProfileTab() {
  const { snap } = useApp()
  const [view, setView] = useState<View>('main')
  if (!snap.me) return null

  if (view === 'sports') return <SubPage title="Mes sports" onBack={() => setView('main')}><SportsEditor /></SubPage>
  if (view === 'visibility') return <SubPage title="Visibilité" onBack={() => setView('main')}><VisibilitySettings /></SubPage>
  return <ProfileMain onNavigate={setView} />
}

function SubPage({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <>
      <header className="page-head sub">
        <button className="icon-btn big" aria-label="Retour au profil" onClick={onBack}>
          <Icon name="chevronLeft" size={22} />
        </button>
        <h1>{title}</h1>
      </header>
      {children}
    </>
  )
}

function SportsEditor() {
  const { app, snap } = useApp()
  return (
    <SportSelection
      value={snap.me?.sports ?? []}
      onChange={(next) => {
        // Au moins un sport : sans quoi on ne pourrait plus démarrer de session.
        if (next.length > 0) app.updateProfile((user) => ({ ...user, sports: next }))
      }}
    />
  )
}

/** Nombre d'entrées de « Activité récente » affichées avant « Voir tout ». */
const ACTIVITY_PREVIEW = 5
const ACTIVITY_MAX = 20

function ProfileMain({ onNavigate }: { onNavigate: (view: View) => void }) {
  const { app, snap } = useApp()
  const me = snap.me!
  const now = useNow(60_000)
  const [name, setName] = useState(me.firstName)
  const [bio, setBio] = useState(me.bio)
  const [ageText, setAgeText] = useState(ageToText(me.age))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showAllActivity, setShowAllActivity] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // Recale les champs si le profil change ailleurs (ex. autre onglet).
  useEffect(() => {
    setName(me.firstName)
    setBio(me.bio)
  }, [me.firstName, me.bio])
  useEffect(() => {
    setAgeText(ageToText(me.age))
  }, [me.age])

  // Les chiffres du profil se déduisent des sessions (en cours et terminées) : rien n'est stocké en plus.
  const sessions = useMemo(() => [...snap.mySessions, ...snap.history], [snap.mySessions, snap.history])
  const summary = useMemo(() => summarizeActivity(sessions, now), [sessions, now])
  const perSport = useMemo(() => sessionsPerSport(sessions), [sessions])

  function commit() {
    const newName = name.trim() || me.firstName
    if (!name.trim()) setName(me.firstName)
    if (newName !== me.firstName || bio !== me.bio) app.updateProfile((user) => ({ ...user, firstName: newName, bio }))
  }

  function commitAge() {
    const age = parseAge(ageText)
    const problem = ageProblem(age)
    if (problem) {
      app.setError(problem)
      setAgeText(ageToText(me.age))
      return
    }
    if (age !== me.age) app.updateProfile((user) => ({ ...user, age }))
  }

  async function onPhoto(file?: File) {
    if (!file) return
    try {
      const photoData = await toAvatarDataURL(file)
      app.updateProfile((user) => ({ ...user, photoData }))
    } catch {
      app.setError('Impossible de charger cette photo.')
    }
  }

  const style = athleteStyleById(me.athleteStyle)
  const primaryID = primarySportID(me)
  const primary = primaryID ? sportById(primaryID) : undefined
  const favorite = summary.favoriteSportID ? sportById(summary.favoriteSportID) : undefined
  const sportsByPrimary = [...me.sports].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((s) => s.sportID)
  const sportSub = (sportID: string) => {
    if (sportID === primaryID) {
      return (
        <span className="tone-gold">
          <Icon name="star" size={11} filled /> Principal
        </span>
      )
    }
    const count = perSport.get(sportID) ?? 0
    return count > 0 ? `${count} session${count > 1 ? 's' : ''}` : undefined
  }
  const finished = snap.history.slice(0, ACTIVITY_MAX)
  const visibleActivity = showAllActivity ? finished : finished.slice(0, ACTIVITY_PREVIEW)

  return (
    <>
      <header className="profile-head">
        <button className="avatar-button" aria-label="Changer la photo de profil" onClick={() => fileInput.current?.click()}>
          <Avatar name={me.firstName} photo={me.photoData} size={96} ring />
          <span className="avatar-badge"><Icon name="camera" size={15} /></span>
        </button>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />

        <div className="profile-id">
          <div className="name-field">
            {/* Le champ s'ajuste à son texte (le crayon reste collé au prénom) : le texte caché en double donne la largeur. */}
            <span className="name-sizer" data-value={name}>
              <input
                className="name-input"
                aria-label="Prénom"
                value={name}
                maxLength={30}
                onChange={(e) => setName(e.target.value)}
                onBlur={commit}
              />
            </span>
            <Icon name="pencil" size={16} />
          </div>
          <div className="pills">
            {style && (
              <span className="pill">
                <span aria-hidden="true">{style.emoji}</span> {style.name}
              </span>
            )}
            {primary && (
              <span className="pill">
                <span aria-hidden="true">{primary.emoji}</span> {primary.name}
              </span>
            )}
          </div>
          <p className="member-since">Membre depuis {formatMonthYearShort(me.joinedAt)}</p>
        </div>
      </header>

      <div className="stats">
        <Stat value={snap.alliances.allies.length} label="Alliés" />
        <Stat value={snap.tribus.mine.length} label="Tribus" />
        <Stat value={me.sports.length} label="Sports" />
        <Stat value={summary.totalSessions} label="Sessions" />
      </div>

      <Panel title="Résumé">
        <div className="summary">
          <SummaryItem icon="activity" tone="blue" value={String(summary.sessionsThisWeek)} label="Sessions cette semaine" />
          <SummaryItem icon="clock" tone="green" value={formatPractice(summary.timeThisWeek)} label="De pratique cette semaine" />
          <SummaryItem icon="calendar" tone="gold" value={String(summary.activeDays30)} label="Jours actifs (30 j)" />
          <SummaryItem icon="trophy" tone="purple" value={favorite?.name ?? '—'} small label="Sport favori" />
        </div>
      </Panel>

      <Panel
        title="Mes sports"
        count={me.sports.length}
        action={
          <button className="link-btn" onClick={() => onNavigate('sports')}>
            Modifier
          </button>
        }
      >
        <SportHexes items={sportsByPrimary.map((sportID) => ({ sportID, sub: sportSub(sportID) }))} />
      </Panel>

      <Panel title="Style de sportif" className="style-panel">
        <AthleteStylePicker value={me.athleteStyle} onChange={(athleteStyle) => app.updateProfile((user) => ({ ...user, athleteStyle }))} />
      </Panel>

      <Panel
        title="Activité récente"
        action={
          finished.length > ACTIVITY_PREVIEW ? (
            <button className="link-btn" onClick={() => setShowAllActivity((value) => !value)}>
              {showAllActivity ? 'Réduire' : `Voir tout (${finished.length})`}
            </button>
          ) : undefined
        }
      >
        {finished.length === 0 && <p className="row-empty">Tes sessions terminées apparaîtront ici.</p>}
        {visibleActivity.map((session) => (
          <div className="activity-row" key={session.id}>
            <span className="sport-emoji" style={{ background: `${sportColor(session.sportID)}26` }} aria-hidden="true">
              {sportById(session.sportID)?.emoji}
            </span>
            <span className="activity-text">
              {sportName(session.sportID)}
              <small>
                {formatDuration(sessionDuration(session, session.endedAt ?? session.startedAt))} · {formatDayTime(session.startedAt)}
              </small>
            </span>
            <span className="activity-when">{formatRelative(session.endedAt ?? session.startedAt, now)}</span>
          </div>
        ))}
      </Panel>

      <Panel title="À propos de moi">
        <textarea
          className="input bio-input"
          aria-label="Bio courte"
          placeholder="Bio courte"
          rows={2}
          value={bio}
          maxLength={BIO_LIMIT}
          onChange={(e) => setBio(e.target.value)}
          onBlur={commit}
        />
        <div className="counter">{bio.length}/{BIO_LIMIT}</div>
        <div className="row">
          <label className="row-title" htmlFor="profile-age">
            Âge
          </label>
          <span className="spacer" />
          <input
            id="profile-age"
            className="input age-input"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            value={ageText}
            onChange={(e) => setAgeText(e.target.value)}
            onBlur={commitAge}
          />
        </div>
        <p className="hint card-hint">Ton âge n'est jamais montré aux autres.</p>
      </Panel>

      <Panel title="Réglages">
        <button className="row row-button" onClick={() => onNavigate('visibility')}>
          <Icon name={me.visibility.isInvisible ? 'eyeOff' : 'eye'} size={20} />
          <span className="row-title">Visibilité</span>
          <span className="spacer" />
          <span className="row-note">{me.visibility.isInvisible ? 'Invisible' : 'Visible'}</span>
          <Icon name="chevronRight" size={18} />
        </button>
      </Panel>

      {app.supportsDemoTools && <DemoTools />}

      {snap.hasAccounts ? (
        <AccountSection />
      ) : (
        <div className="card spaced">
          {confirmDelete ? (
            <>
              <div className="row">
                <div>
                  <strong>Supprimer ton profil sur cet appareil ?</strong>
                  <div className="row-sub wrap">Tes sessions en cours sont arrêtées et tu repasses par l'onboarding.</div>
                </div>
              </div>
              <button className="row row-button danger-text" onClick={() => void app.deleteLocalProfile()}>Supprimer</button>
              <button className="row row-button muted" onClick={() => setConfirmDelete(false)}>Annuler</button>
            </>
          ) : (
            <button className="row row-button danger-text" onClick={() => setConfirmDelete(true)}>Supprimer mon profil local</button>
          )}
        </div>
      )}
      <p className="footnote version">
        GOAT Métavers · version web 0.1 · {snap.hasAccounts ? 'compte réel, présence simulée' : 'données de démonstration'}
      </p>
    </>
  )
}

/** Un chiffre clé du profil (grand nombre, légende en dessous). */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

/** Une colonne de « Résumé » : icône colorée, valeur, légende. `small` réduit la valeur (un nom de sport plutôt qu'un nombre). */
function SummaryItem({ icon, tone, value, label, small = false }: { icon: IconName; tone: 'blue' | 'green' | 'gold' | 'purple'; value: string; label: string; small?: boolean }) {
  return (
    <div className="summary-item">
      <span className={`tone-${tone}`}>
        <Icon name={icon} size={26} />
      </span>
      <b className={small ? 'small' : undefined}>{value}</b>
      <span>{label}</span>
    </div>
  )
}

function DemoTools() {
  const { app, snap } = useApp()
  const { simulated, coordinate } = snap.location
  const current = simulated && coordinate ? DEMO_HUBS.find((h) => h.latitude === coordinate.latitude)?.name ?? '' : ''

  return (
    <>
      <Panel title="Outils de démo">
        <button className="row row-button" onClick={() => void app.demoSimulateRecurringPractice()}>
          <span className="row-main wrap">Simuler 3 jours de pratique près d'un autre pratiquant</span>
        </button>
        <div className="row">
          <label className="row-main" htmlFor="demo-position">Position simulée</label>
          <select
            id="demo-position"
            className="select"
            value={current}
            onChange={(e) => app.demoSetPosition(e.target.value || undefined)}
          >
            <option value="">Réelle (GPS)</option>
            {DEMO_HUBS.map((hub) => (
              <option key={hub.name} value={hub.name}>{hub.name}</option>
            ))}
          </select>
        </div>
      </Panel>
      <p className="footnote">Ajoute un historique fictif pour voir apparaître des Echos, ou impose une position pour tester sans GPS.</p>
    </>
  )
}

function VisibilitySettings() {
  const { app, snap } = useApp()
  const settings = snap.me!.visibility

  return (
    <>
      <div className="card">
        <div className="row">
          <Icon name="eyeOff" size={20} />
          <span className="row-main"><span className="row-title">Mode invisible</span></span>
          <Switch label="Mode invisible" checked={settings.isInvisible} onChange={(value) => app.setVisibility({ isInvisible: value })} />
        </div>
      </div>
      <p className="footnote">Tu disparais de la carte immédiatement, même pendant une session. Tu te vois toujours en grisé.</p>

      <Panel title="Qui peut me voir">
        <div role="radiogroup" aria-label="Qui peut me voir">
          {(Object.keys(VISIBILITY_LABELS) as VisibilityScope[]).map((scope) => (
            <button key={scope} className="row row-button" role="radio" aria-checked={settings.scope === scope} onClick={() => app.setVisibility({ scope })}>
              <span className="row-title">{VISIBILITY_LABELS[scope]}</span>
              <span className="spacer" />
              {settings.scope === scope && <span className="accent"><Icon name="check" size={20} /></span>}
            </button>
          ))}
        </div>
      </Panel>
      <p className="footnote">S'applique à la carte et aux suggestions d'Echos. Tu peux le changer à tout moment.</p>

      <Panel title="Délai avant invisibilité">
        <div className="row">
          <label className="row-main" htmlFor="linger">Après une session</label>
          <select id="linger" className="select" value={settings.lingerMinutes} onChange={(e) => app.setVisibility({ lingerMinutes: Number(e.target.value) })}>
            {LINGER_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>{minutes === 0 ? 'Aucun' : `${minutes} min`}</option>
            ))}
          </select>
        </div>
      </Panel>
      <p className="footnote">Temps pendant lequel tu restes affiché comme « récemment actif » après l'arrêt d'une session.</p>

      <Panel title="Profils bloqués" count={snap.blockedUsers.length}>
        {snap.blockedUsers.length === 0 && <p className="row-empty">Aucun profil bloqué.</p>}
        {snap.blockedUsers.map((user) => (
          <div className="row" key={user.id}>
            <span className="row-main">{user.firstName}</span>
            <button className="btn btn-small" onClick={() => void app.unblock(user.id)}>Débloquer</button>
          </div>
        ))}
      </Panel>
    </>
  )
}

function AccountSection() {
  const { app, snap } = useApp()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  return (
    <>
      <Panel title="Compte">
        <div className="row">
          <span className="row-main">
            <span className="row-sub">Connecté avec</span>
            <span className="row-title">{snap.accountEmail ?? '—'}</span>
          </span>
        </div>
        <button className="row row-button" disabled={busy} onClick={() => void app.signOut()}>
          <span className="row-title">Se déconnecter</span>
        </button>
      </Panel>

      <div className="card spaced">
        {confirmDelete ? (
          <>
            <div className="row">
              <div>
                <strong>Supprimer définitivement ton compte ?</strong>
                <div className="row-sub wrap">Ton profil et toutes tes données sont effacés. Cette action est irréversible.</div>
              </div>
            </div>
            <button
              className="row row-button danger-text"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                await app.deleteAccount()
                setBusy(false)
              }}
            >
              Supprimer définitivement
            </button>
            <button className="row row-button muted" onClick={() => setConfirmDelete(false)}>Annuler</button>
          </>
        ) : (
          <button className="row row-button danger-text" onClick={() => setConfirmDelete(true)}>Supprimer mon compte</button>
        )}
      </div>
    </>
  )
}
