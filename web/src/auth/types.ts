import type { User } from '../core/models'
import type { OAuthProvider } from './providers'

export interface AuthUser {
  id: string
  email?: string
}

export type AuthErrorCode =
  | 'invalidCredentials'
  | 'emailTaken'
  | 'emailNotConfirmed'
  | 'weakPassword'
  | 'emailNotAuthorized'
  | 'rateLimited'
  | 'signupDisabled'
  | 'network'
  | 'unknown'

const MESSAGES: Record<AuthErrorCode, string> = {
  invalidCredentials: 'Email ou mot de passe incorrect.',
  emailTaken: 'Un compte existe déjà avec cet email. Connecte-toi plutôt.',
  emailNotConfirmed: "Ton email n'est pas encore confirmé : ouvre le lien reçu par email, puis reconnecte-toi.",
  weakPassword: 'Mot de passe trop faible : 8 caractères minimum.',
  emailNotAuthorized: "L'envoi d'emails n'est pas configuré pour cette adresse.",
  rateLimited: 'Trop de tentatives. Réessaie dans quelques minutes.',
  signupDisabled: 'Les inscriptions sont désactivées pour le moment.',
  network: 'Connexion impossible. Vérifie ta connexion internet et réessaie.',
  unknown: 'Une erreur est survenue. Réessaie.',
}

/** Erreur d'authentification avec un message directement affichable (en français). */
export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message?: string,
  ) {
    super(message ?? MESSAGES[code])
    this.name = 'AuthError'
  }
}

export interface SignUpInput {
  email: string
  password: string
  firstName: string
}

export interface SignUpResult {
  /** Défini quand une session est ouverte tout de suite (confirmation d'email désactivée). */
  user?: AuthUser
  /** Vrai quand un email de confirmation a été envoyé : pas de session avant le clic sur le lien. */
  needsEmailConfirmation: boolean
}

export type AuthEvent = 'signedIn' | 'signedOut' | 'passwordRecovery'

export interface RestoredSession {
  user?: AuthUser
  /** Vrai quand l'app a été ouverte depuis un lien « mot de passe oublié » valide. */
  recovery: boolean
  /** Message à afficher quand l'app a été ouverte depuis un lien invalide ou expiré, ou après une connexion annulée. */
  linkError?: string
}

/** Comptes et sessions (Supabase Auth en production). */
export interface AuthService {
  restore(): Promise<RestoredSession>
  onChange(listener: (event: AuthEvent, user?: AuthUser) => void): () => void
  signUp(input: SignUpInput): Promise<SignUpResult>
  signIn(email: string, password: string): Promise<AuthUser>
  /**
   * Connexion avec un fournisseur (Google…). Avec Supabase, la page part chez le fournisseur puis revient connectée
   * (événement `signedIn`) : rien n'est renvoyé. Les comptes en mémoire ouvrent la session tout de suite et renvoient l'utilisateur.
   */
  signInWithProvider(provider: OAuthProvider): Promise<AuthUser | undefined>
  signOut(): Promise<void>
  sendPasswordReset(email: string): Promise<void>
  updatePassword(password: string): Promise<void>
  /** Supprime le compte ET toutes ses données, puis ferme la session. */
  deleteAccount(): Promise<void>
}

/** Profils enregistrés par compte (table `profiles` + `profile_sports`). */
export interface ProfileRepository {
  load(userID: string): Promise<User | undefined>
  /** Enregistre le profil complet (atomique). */
  save(user: User): Promise<void>
}

export interface Accounts {
  auth: AuthService
  profiles: ProfileRepository
  /** Fournisseurs de connexion activés (un bouton « Continuer avec… » chacun). Aucun par défaut. */
  providers?: readonly OAuthProvider[]
}
