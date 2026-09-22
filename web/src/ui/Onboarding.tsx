import { useState } from 'react'
import { useApp } from '../state/context'
import { LogoMark } from './common'
import { ProfileWizard } from './ProfileWizard'

/**
 * Profil à compléter (prénom, âge, style, sports) puis localisation en opt-in explicite. Sert quand le compte existe déjà
 * (première connexion avec Google, inscription interrompue) et en mode démo sans compte, où c'est ici que le profil local est créé.
 * L'inscription par email a son propre parcours (voir AuthScreen) : le compte n'y est créé qu'à la fin.
 */
export function Onboarding() {
  const { app, snap } = useApp()
  const accountMode = snap.hasAccounts
  const [started, setStarted] = useState(accountMode) // mode démo : un petit écran d'accueil d'abord

  if (!started) {
    return (
      <main className="onboarding">
        <div className="onboarding-body">
          <div className="hero-icon brand" aria-hidden="true">
            <LogoMark size={54} />
          </div>
          <h1>GOAT Métavers</h1>
          <p className="lead">La carte vivante des sportifs. Vois qui pratique quoi, maintenant, près de toi — et croise-les pour de vrai.</p>
        </div>
        <button className="btn btn-primary btn-block btn-large" onClick={() => setStarted(true)}>
          Commencer
        </button>
      </main>
    )
  }

  const me = snap.me
  return (
    <ProfileWizard
      initial={{
        firstName: me?.firstName ?? '',
        ageText: me?.age === undefined ? '' : String(me.age),
        athleteStyle: me?.athleteStyle,
        sports: me?.sports ?? [],
      }}
      progress={{ first: 1, total: 3 }}
      finish={{ allow: 'Autoriser la localisation', skip: 'Plus tard' }}
      onFinish={async (details, requestLocation) => {
        if (requestLocation) await app.location.requestPermission()
        await app.completeOnboarding(details)
      }}
      extraAction={
        accountMode && (
          <button className="btn btn-plain btn-block" onClick={() => void app.signOut()}>
            Ce n'est pas toi ? Changer de compte
          </button>
        )
      }
    />
  )
}
