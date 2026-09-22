import type { User } from '../core/models'
import { uuid } from '../core/uuid'
import type { OAuthProvider } from './providers'
import {
  AuthError,
  type Accounts,
  type AuthEvent,
  type AuthService,
  type AuthUser,
  type ProfileRepository,
  type RestoredSession,
  type SignUpInput,
  type SignUpResult,
} from './types'
import { MIN_PASSWORD_LENGTH } from './validation'

export interface MemoryAccountsOptions {
  /** Comme Supabase avec « Confirm email » activé : pas de session avant le clic sur le lien. */
  requireEmailConfirmation?: boolean
  /** Fournisseurs de connexion « activés » (boutons « Continuer avec… »). Aucun par défaut. */
  providers?: readonly OAuthProvider[]
}

/** Personne qui se connecte chez le fournisseur (Google…) : ses infos arrivent avec la connexion. */
export interface ProviderIdentity {
  email: string
  /** Prénom donné par le fournisseur (Google le fournit ; Apple ne le fournirait pas). */
  firstName?: string
}

interface Row {
  id: string
  email: string
  /** Absent pour un compte créé uniquement via un fournisseur : pas de mot de passe tant qu'il n'en choisit pas un. */
  password?: string
  confirmed: boolean
}

/**
 * Comptes en mémoire, avec les mêmes règles que Supabase (unicité de l'email, confirmation, mot de passe minimal…).
 * Sert aux tests et à essayer l'interface en développement (`?auth=memory`) sans projet Supabase.
 */
export class MemoryAccounts implements Accounts {
  readonly auth: AuthService
  readonly profiles: ProfileRepository
  readonly providers: readonly OAuthProvider[]
  /** Emails « envoyés » (consultables par les tests). */
  readonly sentEmails: { kind: 'confirm' | 'reset'; to: string }[] = []

  private rows = new Map<string, Row>()
  private profileRows = new Map<string, User>()
  private current?: AuthUser
  private recovery = false
  private listeners = new Set<(event: AuthEvent, user?: AuthUser) => void>()
  private providerAccounts: Record<OAuthProvider, ProviderIdentity> = { google: { email: 'camille@gmail.com', firstName: 'Camille' } }

  constructor(private readonly options: MemoryAccountsOptions = {}) {
    this.providers = options.providers ?? []
    this.auth = {
      restore: async (): Promise<RestoredSession> => ({ user: this.current, recovery: this.recovery && this.current !== undefined }),
      onChange: (listener) => {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      },
      signUp: (input) => this.signUp(input),
      signIn: (email, password) => this.signIn(email, password),
      signInWithProvider: (provider) => this.signInWithProvider(provider),
      signOut: async () => {
        this.startSession(undefined)
      },
      sendPasswordReset: async (email) => {
        // Comme Supabase : même réponse que l'adresse existe ou non (pas d'énumération des comptes).
        if (this.findByEmail(email)) this.sentEmails.push({ kind: 'reset', to: normalize(email) })
      },
      updatePassword: async (password) => {
        const row = this.requireSession()
        if (password.length < MIN_PASSWORD_LENGTH) throw new AuthError('weakPassword')
        row.password = password
        this.recovery = false
      },
      deleteAccount: async () => {
        const row = this.requireSession()
        this.rows.delete(row.id)
        this.profileRows.delete(row.id)
        this.startSession(undefined)
      },
    }

    this.profiles = {
      load: async (userID) => {
        const profile = this.profileRows.get(userID)
        return profile && structuredClone(profile)
      },
      save: async (user) => {
        this.requireSession()
        if (this.current?.id !== user.id) throw new Error('Action non autorisée.')
        this.profileRows.set(user.id, structuredClone(user))
      },
    }
  }

  // MARK: Simulation des actions hors application (utile aux tests)

  /** Simule le clic sur le lien de confirmation reçu par email. */
  confirmEmail(email: string): void {
    const row = this.findByEmail(email)
    if (row) row.confirmed = true
  }

  /** Simule l'ouverture du lien « mot de passe oublié » : une session s'ouvre et l'app doit demander un nouveau mot de passe. */
  openRecoveryLink(email: string): void {
    const row = this.findByEmail(email)
    if (!row) return
    this.recovery = true
    this.current = { id: row.id, email: row.email }
    this.emit('passwordRecovery', this.current)
  }

  /** Simule le choix du compte chez le fournisseur : c'est cette personne qui sera connectée au prochain `signInWithProvider`. */
  setProviderAccount(provider: OAuthProvider, identity: ProviderIdentity): void {
    this.providerAccounts[provider] = identity
  }

  // MARK: Implémentation

  private async signUp({ email, password, firstName }: SignUpInput): Promise<SignUpResult> {
    if (password.length < MIN_PASSWORD_LENGTH) throw new AuthError('weakPassword')
    if (this.findByEmail(email)) throw new AuthError('emailTaken')

    const row: Row = { id: uuid(), email: normalize(email), password, confirmed: !this.options.requireEmailConfirmation }
    this.rows.set(row.id, row)
    this.createProfile(row, firstName)

    if (!row.confirmed) {
      this.sentEmails.push({ kind: 'confirm', to: row.email })
      return { needsEmailConfirmation: true }
    }
    const user = this.startSession(row)!
    return { user, needsEmailConfirmation: false }
  }

  private async signIn(email: string, password: string): Promise<AuthUser> {
    const row = this.findByEmail(email)
    if (!row || row.password === undefined || row.password !== password) throw new AuthError('invalidCredentials')
    if (!row.confirmed) throw new AuthError('emailNotConfirmed')
    return this.startSession(row)!
  }

  private async signInWithProvider(provider: OAuthProvider): Promise<AuthUser> {
    if (!this.providers.includes(provider)) throw new AuthError('unknown', "Cette connexion n'est pas activée.")
    const identity = this.providerAccounts[provider]
    let row = this.findByEmail(identity.email)
    if (row) {
      // Comme Supabase (liaison automatique par email, vérifié par le fournisseur) : c'est le même compte. Une inscription par
      // mot de passe jamais confirmée perd son mot de passe à la liaison : sans cela, quelqu'un aurait pu s'inscrire d'avance
      // avec l'email d'autrui puis entrer dans son compte (« pre-account takeover »).
      if (!row.confirmed) row.password = undefined
      row.confirmed = true
    } else {
      row = { id: uuid(), email: normalize(identity.email), confirmed: true }
      this.rows.set(row.id, row)
      this.createProfile(row, identity.firstName)
    }
    return this.startSession(row)!
  }

  /** Équivalent du déclencheur SQL `handle_new_user` : le profil existe dès la création du compte, sans sports. */
  private createProfile(row: Row, firstName: string | undefined): void {
    this.profileRows.set(row.id, {
      id: row.id,
      firstName: firstName?.trim() || row.email.split('@')[0] || 'Sportif',
      bio: '',
      sports: [],
      visibility: { scope: 'everyone', isInvisible: false, lingerMinutes: 15 },
      joinedAt: Date.now(),
    })
  }

  private startSession(row: Row | undefined): AuthUser | undefined {
    this.recovery = false
    if (!row) {
      this.current = undefined
      this.emit('signedOut')
      return undefined
    }
    this.current = { id: row.id, email: row.email }
    this.emit('signedIn', this.current)
    return this.current
  }

  private requireSession(): Row {
    const row = this.current && this.rows.get(this.current.id)
    if (!row) throw new AuthError('unknown', 'Session expirée : reconnecte-toi.')
    return row
  }

  private findByEmail(email: string): Row | undefined {
    const wanted = normalize(email)
    return [...this.rows.values()].find((row) => row.email === wanted)
  }

  private emit(event: AuthEvent, user?: AuthUser): void {
    for (const listener of this.listeners) listener(event, user)
  }
}

const normalize = (email: string): string => email.trim().toLowerCase()
