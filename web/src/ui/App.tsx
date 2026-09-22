import { useEffect, useState } from 'react'
import type { AppState } from '../state/appState'
import { AppProvider, useApp } from '../state/context'
import { ActualiteTab } from './ActualiteTab'
import { AlliancesTab } from './AlliancesTab'
import { AuthScreen, NewPasswordScreen } from './AuthScreen'
import { EchoesTab } from './EchoesTab'
import { LogoMark } from './common'
import { Icon, type IconName } from './Icon'
import { MapTab } from './MapTab'
import { Onboarding } from './Onboarding'
import { ProfileTab } from './ProfileTab'

export function App({ app }: { app: AppState }) {
  return (
    <AppProvider app={app}>
      <Shell />
    </AppProvider>
  )
}

function Shell() {
  const { app, snap } = useApp()

  useEffect(() => {
    void app.bootstrap()
  }, [app])

  // Foreground uniquement : on suspend les rafraîchissements et la localisation quand la page est masquée.
  useEffect(() => {
    const onVisibility = () => app.setForeground(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [app])

  return (
    <>
      {snap.phase === 'loading' && (
        <div className="splash" role="status" aria-label="Chargement">
          <LogoMark size={68} />
          <span className="spinner" aria-hidden="true" />
        </div>
      )}
      {/* Après un lien « mot de passe oublié », rien d'autre n'est monté : on choisit d'abord le nouveau mot de passe. */}
      {snap.passwordRecovery && <NewPasswordScreen />}
      {!snap.passwordRecovery && snap.phase === 'signedOut' && <AuthScreen />}
      {!snap.passwordRecovery && snap.phase === 'onboarding' && <Onboarding />}
      {!snap.passwordRecovery && snap.phase === 'ready' && <MainTabs />}
      {snap.errorMessage && (
        <div className="toast" role="alert">
          <span>{snap.errorMessage}</span>
          <button className="toast-close" aria-label="Fermer" onClick={() => app.setError(undefined)}>
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
    </>
  )
}

type Tab = 'map' | 'actualite' | 'alliances' | 'echoes' | 'profile'

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'map', label: 'Carte', icon: 'map' },
  { id: 'actualite', label: 'Actualité', icon: 'activity' },
  { id: 'alliances', label: 'Alliances', icon: 'people' },
  { id: 'echoes', label: 'Echos', icon: 'radar' },
  { id: 'profile', label: 'Profil', icon: 'person' },
]

function MainTabs() {
  const { snap } = useApp()
  const [tab, setTab] = useState<Tab>('map')
  const badges: Partial<Record<Tab, number>> = { alliances: snap.alliances.incoming.length, echoes: snap.echoes.length }

  return (
    <>
      {/* Tous les onglets restent montés (la carte coûte cher à recréer) ; les autres sont simplement masqués. */}
      <div className="panel panel-map" hidden={tab !== 'map'} role="tabpanel">
        <MapTab active={tab === 'map'} onOpenProfile={() => setTab('profile')} />
      </div>
      <div className="panel" hidden={tab !== 'actualite'} role="tabpanel">
        <ActualiteTab />
      </div>
      <div className="panel" hidden={tab !== 'alliances'} role="tabpanel">
        <AlliancesTab />
      </div>
      <div className="panel" hidden={tab !== 'echoes'} role="tabpanel">
        <EchoesTab />
      </div>
      <div className="panel" hidden={tab !== 'profile'} role="tabpanel">
        <ProfileTab />
      </div>

      <nav className="tabbar" role="tablist" aria-label="Navigation">
        {TABS.map(({ id, label, icon }) => (
          <button key={id} className="tab" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            <Icon name={icon} size={26} />
            <span>{label}</span>
            {!!badges[id] && <span className="tab-badge">{badges[id]}</span>}
          </button>
        ))}
      </nav>
    </>
  )
}
