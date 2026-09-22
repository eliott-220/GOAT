import { useState, type FormEvent, type ReactNode } from 'react'
import { OAUTH_PROVIDER_LABELS, type OAuthProvider } from '../auth/providers'
import { accountStepProblem, isValidEmail, MIN_PASSWORD_LENGTH, passwordProblem } from '../auth/validation'
import { useApp } from '../state/context'
import { Logo } from './common'
import { Icon } from './Icon'
import { EMPTY_DRAFT, ProfileWizard, StepProgress, type WizardDraft } from './ProfileWizard'

type Mode = 'signUp' | 'signIn' | 'forgot'

/**
 * L'inscription se fait en deux temps : d'abord le compte (email + mot de passe + confirmation), puis le profil (prénom, âge,
 * style de sportif, sports, localisation). Le compte n'est créé qu'à la toute fin : abandonner en route ne laisse rien derrière soi.
 */
type SignUpStage = 'account' | 'profile'

/** Compte, profil, sports, localisation. */
const SIGN_UP_STEPS = 4

/** Logos aux couleurs officielles des fournisseurs (à ne pas modifier). */
const PROVIDER_LOGOS: Record<OAuthProvider, ReactNode> = {
  google: (
    <svg className="provider-logo" width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  ),
}

/** Création de compte, connexion et « mot de passe oublié » (email + mot de passe, et Google si activé). */
export function AuthScreen() {
  const { app, snap } = useApp()
  const [mode, setMode] = useState<Mode>('signUp')
  const [stage, setStage] = useState<SignUpStage>('account')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [draft, setDraft] = useState<WizardDraft>(EMPTY_DRAFT)
  const [localError, setLocalError] = useState<string>()
  const { authBusy, authError, authNotice, authProviders } = snap
  const error = localError ?? authError

  const switchMode = (next: Mode) => {
    app.clearAuthMessages()
    setLocalError(undefined)
    setStage('account')
    setMode(next)
  }

  if (authNotice?.kind === 'confirmEmail') {
    return (
      <main className="onboarding">
        <div className="onboarding-body">
          <div className="hero-icon" aria-hidden="true">✉️</div>
          <h1>Vérifie ta boîte mail</h1>
          <p className="lead">
            On a envoyé un lien de confirmation à <strong>{authNotice.email}</strong>. Ouvre-le, puis reviens te connecter.
          </p>
        </div>
        <button className="btn btn-primary btn-block btn-large" onClick={() => switchMode('signIn')}>
          J'ai confirmé, me connecter
        </button>
        <button className="btn btn-plain btn-block" onClick={() => switchMode('signUp')}>
          Changer d'adresse
        </button>
      </main>
    )
  }

  if (authNotice?.kind === 'resetSent') {
    return (
      <main className="onboarding">
        <div className="onboarding-body">
          <div className="hero-icon" aria-hidden="true">✉️</div>
          <h1>Email envoyé</h1>
          <p className="lead">
            Si un compte existe pour <strong>{authNotice.email}</strong>, il vient de recevoir un lien pour choisir un nouveau mot de passe.
          </p>
        </div>
        <button className="btn btn-primary btn-block btn-large" onClick={() => switchMode('signIn')}>
          Retour à la connexion
        </button>
      </main>
    )
  }

  if (mode === 'signUp' && stage === 'profile') {
    return (
      <ProfileWizard
        initial={draft}
        externalError={authError}
        progress={{ first: 2, total: SIGN_UP_STEPS }}
        onBack={(current) => {
          setDraft(current)
          setStage('account')
        }}
        finish={{ allow: 'Autoriser et créer mon compte', skip: 'Créer mon compte, localisation plus tard' }}
        onFinish={async (details, requestLocation) => {
          setDraft({ firstName: details.firstName, ageText: String(details.age), athleteStyle: details.athleteStyle, sports: details.sports })
          if (requestLocation) await app.location.requestPermission()
          await app.signUp({ email: email.trim(), password, firstName: details.firstName }, details)
          // En cas d'erreur, garder les sports et le profil saisis pour permettre une nouvelle tentative.
          // Un compte créé avec confirmation d'email affiche son écran dédié via authNotice.
        }}
      />
    )
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setLocalError(undefined)
    app.clearAuthMessages()
    const mail = email.trim()

    if (mode === 'signUp') {
      const problem = accountStepProblem(mail, password, confirm)
      if (problem) return setLocalError(problem)
      return setStage('profile') // rien n'est créé avant la dernière étape
    }
    if (!isValidEmail(mail)) return setLocalError("Cette adresse email n'a pas l'air valide.")
    if (mode === 'forgot') return void app.sendPasswordReset(mail)
    if (!password) return setLocalError('Entre ton mot de passe.')
    void app.signIn(mail, password)
  }

  const title = mode === 'signUp' ? 'Créer un compte' : mode === 'signIn' ? 'Se connecter' : 'Mot de passe oublié'
  const submitLabel = mode === 'signUp' ? 'Continuer' : mode === 'signIn' ? 'Me connecter' : 'Envoyer le lien'
  const passwordType = showPassword ? 'text' : 'password'

  return (
    <form className="onboarding auth" onSubmit={onSubmit} noValidate>
      <div className="onboarding-body">
        <Logo />
        {mode === 'signUp' && <StepProgress current={1} total={SIGN_UP_STEPS} />}
        <h1>{title}</h1>
        {mode === 'signUp' && <p className="lead">La carte vivante des sportifs. Crée ton compte pour retrouver ton profil sur tous tes appareils.</p>}
        {mode === 'forgot' && <p className="lead">Entre ton email : on t'envoie un lien pour choisir un nouveau mot de passe.</p>}
        {authNotice?.kind === 'passwordChanged' && <p className="notice ok">Mot de passe modifié. Tu peux te connecter.</p>}

        {mode !== 'forgot' && authProviders.length > 0 && (
          <>
            {authProviders.map((provider) => (
              <button
                key={provider}
                type="button"
                className="btn btn-provider btn-block btn-large"
                disabled={authBusy}
                onClick={() => {
                  setLocalError(undefined)
                  void app.signInWithProvider(provider)
                }}
              >
                {PROVIDER_LOGOS[provider]}
                Continuer avec {OAUTH_PROVIDER_LABELS[provider]}
              </button>
            ))}
            <div className="divider">
              <span>ou avec ton email</span>
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {mode !== 'forgot' && (
          <div className="field">
            <label htmlFor="auth-password">Mot de passe</label>
            <div className="password-row">
              <input
                id="auth-password"
                className="input"
                type={passwordType}
                autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                onClick={() => setShowPassword((value) => !value)}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
            {mode === 'signUp' && <p className="hint">{MIN_PASSWORD_LENGTH} caractères minimum.</p>}
          </div>
        )}

        {mode === 'signUp' && (
          <div className="field">
            <label htmlFor="auth-confirm">Confirmer le mot de passe</label>
            <input
              id="auth-confirm"
              className="input"
              type={passwordType}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <button type="submit" className="btn btn-primary btn-block btn-large" disabled={authBusy}>
        {authBusy ? <span className="spinner on-accent" aria-label="Chargement" /> : submitLabel}
      </button>

      {mode === 'signUp' && (
        <>
          <p className="footnote centered">En continuant, tu acceptes que ton profil (prénom, âge, sports, réglages) soit enregistré pour faire fonctionner GOAT.</p>
          <button type="button" className="btn btn-plain btn-block" onClick={() => switchMode('signIn')}>
            J'ai déjà un compte
          </button>
        </>
      )}
      {mode === 'signIn' && (
        <>
          <button type="button" className="btn btn-plain btn-block" onClick={() => switchMode('forgot')}>
            Mot de passe oublié ?
          </button>
          <button type="button" className="btn btn-plain btn-block" onClick={() => switchMode('signUp')}>
            Créer un compte
          </button>
        </>
      )}
      {mode === 'forgot' && (
        <button type="button" className="btn btn-plain btn-block" onClick={() => switchMode('signIn')}>
          Retour à la connexion
        </button>
      )}
    </form>
  )
}

/** Affiché par-dessus tout après un lien « mot de passe oublié » : la personne choisit son nouveau mot de passe. */
export function NewPasswordScreen() {
  const { app, snap } = useApp()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState<string>()
  const error = localError ?? snap.authError

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setLocalError(undefined)
    const problem = passwordProblem(password)
    if (problem) return setLocalError(problem)
    if (password !== confirm) return setLocalError('Les deux mots de passe sont différents.')
    void app.setNewPassword(password)
  }

  return (
    <form className="onboarding" onSubmit={onSubmit} noValidate>
      <div className="onboarding-body">
        <div className="hero-icon" aria-hidden="true">
          <Icon name="check" size={44} />
        </div>
        <h1>Nouveau mot de passe</h1>
        <p className="lead">Choisis un nouveau mot de passe pour ton compte{snap.accountEmail ? ` (${snap.accountEmail})` : ''}.</p>
        <div className="field">
          <label htmlFor="new-password">Nouveau mot de passe</label>
          <input id="new-password" className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="hint">{MIN_PASSWORD_LENGTH} caractères minimum.</p>
        </div>
        <div className="field">
          <label htmlFor="new-password-confirm">Confirme le mot de passe</label>
          <input id="new-password-confirm" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <button type="submit" className="btn btn-primary btn-block btn-large" disabled={snap.authBusy}>
        {snap.authBusy ? <span className="spinner on-accent" aria-label="Chargement" /> : 'Enregistrer'}
      </button>
    </form>
  )
}
