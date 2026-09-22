import { useState, type FormEvent, type ReactNode } from 'react'
import type { AthleteStyleID, UserSport } from '../core/models'
import { ageProblem, parseAge, type ProfileDetails } from '../core/profileRules'
import { Icon } from './Icon'
import { AthleteStylePicker } from './ProfileFields'
import { SportSelection } from './SportSelection'

/** Ce que la personne a saisi jusqu'ici (l'âge reste du texte tant qu'il n'est pas validé). */
export interface WizardDraft {
  firstName: string
  ageText: string
  athleteStyle?: AthleteStyleID
  sports: UserSport[]
}

export const EMPTY_DRAFT: WizardDraft = { firstName: '', ageText: '', sports: [] }

type Step = 'profile' | 'sports' | 'location'

/** « Étape 2 sur 4 » et sa barre de progression. */
export function StepProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="step-progress">
      <span className="step-progress-label">
        Étape {current} sur {total}
      </span>
      <span className="step-progress-bar" aria-hidden="true">
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className={index < current ? 'on' : ''} />
        ))}
      </span>
    </div>
  )
}

interface ProfileWizardProps {
  /** Valeurs de départ (ex. le prénom donné par Google). */
  initial?: Partial<WizardDraft>
  /** Numéro de la 1re étape de l'assistant dans le parcours complet, et nombre total d'étapes (ex. 2 sur 4 si « Compte » vient avant). */
  progress: { first: number; total: number }
  /** Retour vers l'étape d'avant l'assistant (ex. « Compte »). Reçoit la saisie, pour la retrouver au retour. */
  onBack?: (draft: WizardDraft) => void
  /** Libellés des deux boutons de la dernière étape (localisation). */
  finish: { allow: string; skip: string }
  /** Dernière action : crée le compte (inscription) ou enregistre le profil (compte déjà créé). */
  onFinish: (details: ProfileDetails, requestLocation: boolean) => Promise<void>
  /** Sous les boutons de la dernière étape (ex. « Ce n'est pas toi ? Changer de compte »). */
  extraAction?: ReactNode
}

/**
 * Profil en trois étapes : prénom + âge + style de sportif, puis les sports, puis la localisation (opt-in explicite).
 * Sert à l'inscription (le compte n'est créé qu'à la fin) comme à la première connexion avec Google.
 */
export function ProfileWizard({ initial, progress, onBack, finish, onFinish, extraAction }: ProfileWizardProps) {
  const [draft, setDraft] = useState<WizardDraft>({ ...EMPTY_DRAFT, ...initial })
  const [step, setStep] = useState<Step>('profile')
  const [problem, setProblem] = useState<string>()
  const [busy, setBusy] = useState(false)

  const patch = (change: Partial<WizardDraft>) => {
    setProblem(undefined)
    setDraft((current) => ({ ...current, ...change }))
  }

  function continueFromProfile(event: FormEvent) {
    event.preventDefault()
    if (!draft.firstName.trim()) return setProblem('Ajoute ton prénom.')
    const invalidAge = ageProblem(parseAge(draft.ageText))
    if (invalidAge) return setProblem(invalidAge)
    if (!draft.athleteStyle) return setProblem('Choisis ton style de sportif.')
    setStep('sports')
  }

  async function submit(requestLocation: boolean) {
    const age = parseAge(draft.ageText)
    if (age === undefined || !draft.athleteStyle) return // déjà vérifié à l'étape « profil »
    setBusy(true)
    try {
      await onFinish({ firstName: draft.firstName.trim(), age, athleteStyle: draft.athleteStyle, sports: draft.sports }, requestLocation)
    } finally {
      setBusy(false) // en cas d'échec (ex. hors connexion), on peut réessayer
    }
  }

  if (step === 'profile') {
    return (
      <form className="onboarding auth" onSubmit={continueFromProfile} noValidate>
        <div className="onboarding-body">
          <StepProgress current={progress.first} total={progress.total} />
          <h1>Parle-nous de toi</h1>
          <p className="lead">Ton prénom, ton âge et ton style de sportif.</p>

          <div className="field">
            <label htmlFor="wizard-name">Prénom</label>
            <input
              id="wizard-name"
              className="input"
              value={draft.firstName}
              autoComplete="given-name"
              maxLength={30}
              enterKeyHint="next"
              onChange={(e) => patch({ firstName: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="wizard-age">Âge</label>
            <input
              id="wizard-age"
              className="input"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={3}
              autoComplete="off"
              value={draft.ageText}
              onChange={(e) => patch({ ageText: e.target.value })}
            />
            <p className="hint">Ton âge n'est jamais montré aux autres.</p>
          </div>

          <div className="field">
            <p className="field-label">Ton style de sportif</p>
            <AthleteStylePicker value={draft.athleteStyle} onChange={(athleteStyle) => patch({ athleteStyle })} />
          </div>

          {problem && (
            <p className="form-error" role="alert">
              {problem}
            </p>
          )}
        </div>

        <button type="submit" className="btn btn-primary btn-block btn-large">
          Continuer
        </button>
        {onBack && (
          <button type="button" className="btn btn-plain btn-block" onClick={() => onBack(draft)}>
            Retour
          </button>
        )}
      </form>
    )
  }

  if (step === 'sports') {
    return (
      <main className="onboarding onboarding-scroll">
        <header className="onboarding-head">
          <StepProgress current={progress.first + 1} total={progress.total} />
          <h1>Tes sports</h1>
          <p className="lead">Cherche et choisis les sports que tu pratiques, puis touche l'étoile pour définir ton sport principal.</p>
        </header>
        <div className="onboarding-list">
          <SportSelection value={draft.sports} onChange={(sports) => patch({ sports })} />
        </div>
        <footer className="onboarding-foot">
          <button className="btn btn-primary btn-block btn-large" disabled={draft.sports.length === 0} onClick={() => setStep('location')}>
            Continuer
          </button>
          <button className="btn btn-plain btn-block" onClick={() => setStep('profile')}>
            Retour
          </button>
        </footer>
      </main>
    )
  }

  return (
    <main className="onboarding">
      <div className="onboarding-body">
        <StepProgress current={progress.first + 2} total={progress.total} />
        <div className="hero-icon" aria-hidden="true">
          <Icon name="locate" size={40} />
        </div>
        <h1>Ta position, ton choix</h1>
        <ul className="bullets">
          <li>Ta position n'est utilisée que pendant une session de sport.</li>
          <li>Les autres ne voient qu'une zone approximative (~150 m), jamais ta position exacte.</li>
          <li>Tu peux te rendre invisible à tout moment.</li>
        </ul>
      </div>
      <button className="btn btn-primary btn-block btn-large" disabled={busy} onClick={() => void submit(true)}>
        {busy ? <span className="spinner on-accent" aria-label="Chargement" /> : finish.allow}
      </button>
      <button className="btn btn-plain btn-block" disabled={busy} onClick={() => void submit(false)}>
        {finish.skip}
      </button>
      <button className="btn btn-plain btn-block" disabled={busy} onClick={() => setStep('sports')}>
        Retour
      </button>
      {extraAction}
    </main>
  )
}
