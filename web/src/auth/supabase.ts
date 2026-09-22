import { createClient, type AuthError as SupabaseAuthError, type User as SupabaseUser } from '@supabase/supabase-js'
import { isAthleteStyleID } from '../core/athleteStyles'
import { DEFAULT_VISIBILITY, type User, type UserSport, type VisibilityScope } from '../core/models'
import { assertPublicKey } from './keys'
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

const toAuthUser = (user: Pick<SupabaseUser, 'id' | 'email'>): AuthUser => ({ id: user.id, email: user.email ?? undefined })

/** Traduit une erreur Supabase Auth en erreur applicative (message français prêt à afficher). */
export function mapSupabaseError(error: SupabaseAuthError): AuthError {
  const { code, status, name } = error as { code?: string; status?: number; name?: string }
  switch (code) {
    case 'invalid_credentials':
      return new AuthError('invalidCredentials')
    case 'user_already_exists':
    case 'email_exists':
      return new AuthError('emailTaken')
    case 'email_not_confirmed':
      return new AuthError('emailNotConfirmed')
    case 'weak_password':
      return new AuthError('weakPassword')
    case 'email_address_not_authorized':
      return new AuthError('emailNotAuthorized')
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return new AuthError('rateLimited')
    case 'signup_disabled':
      return new AuthError('signupDisabled')
    case 'same_password':
      return new AuthError('unknown', "Choisis un mot de passe différent de l'ancien.")
    case 'otp_expired':
      return new AuthError('unknown', 'Ce lien a expiré ou a déjà été utilisé. Refais la demande.')
  }
  if (status === 429) return new AuthError('rateLimited')
  if (name === 'AuthRetryableFetchError' || status === 0) return new AuthError('network')
  return new AuthError('unknown')
}

interface ProfileRow {
  first_name: string
  bio: string
  photo_data: string | null
  age: number | null
  athlete_style: string | null
  visibility_scope: VisibilityScope
  is_invisible: boolean
  linger_minutes: number
  joined_at: string
  profile_sports: { sport_id: string; is_primary: boolean }[] | null
}

export interface SupabaseAccountsOptions {
  /** Fournisseurs OAuth activés dans le projet Supabase : un bouton « Continuer avec… » chacun. */
  providers?: readonly OAuthProvider[]
  /** Ouvre l'adresse du fournisseur. Par défaut : navigation du navigateur (remplaçable dans les tests). */
  navigate?: (url: string) => void
}

/**
 * Comptes réels : Supabase Auth (email + mot de passe, et Google si activé) et tables `profiles` / `profile_sports`
 * (voir supabase/migrations). La clé fournie doit être la clé PUBLIQUE : les règles RLS protègent les données.
 */
export function createSupabaseAccounts(url: string, publicKey: string, options: SupabaseAccountsOptions = {}): Accounts {
  assertPublicKey(publicKey)
  const { providers = [], navigate = (target: string) => location.assign(target) } = options

  // À lire AVANT createClient : le SDK consomme puis efface l'URL de retour des emails et des fournisseurs.
  const hash = typeof location === 'undefined' ? '' : `${location.hash}${location.search}`
  const openedFromRecoveryLink = /type=recovery/.test(hash)
  // Retour en erreur : lien d'email expiré (`otp_expired`), ou connexion Google annulée / refusée (`error=access_denied`…).
  const linkError = /error_code=otp_expired/.test(hash)
    ? 'Ce lien a expiré ou a déjà été utilisé. Refais la demande.'
    : /[#?&]error=/.test(hash)
      ? 'La connexion a été annulée ou a échoué. Réessaie.'
      : undefined

  const client = createClient(url, publicKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  const redirectTo = typeof location === 'undefined' ? undefined : location.origin

  const auth: AuthService = {
    async restore(): Promise<RestoredSession> {
      const { data, error } = await client.auth.getSession()
      if (error) throw mapSupabaseError(error)
      const user = data.session ? toAuthUser(data.session.user) : undefined
      return { user, recovery: openedFromRecoveryLink && user !== undefined, linkError: user ? undefined : linkError }
    },

    onChange(listener) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        // Le SDK exécute ce rappel sous verrou : y appeler d'autres méthodes Supabase bloquerait. On diffère.
        setTimeout(() => {
          let mapped: AuthEvent | undefined
          if (event === 'SIGNED_IN') mapped = 'signedIn'
          else if (event === 'SIGNED_OUT') mapped = 'signedOut'
          else if (event === 'PASSWORD_RECOVERY') mapped = 'passwordRecovery'
          if (mapped) listener(mapped, session ? toAuthUser(session.user) : undefined)
        }, 0)
      })
      return () => data.subscription.unsubscribe()
    },

    async signUp({ email, password, firstName }: SignUpInput): Promise<SignUpResult> {
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        // Le déclencheur SQL `handle_new_user` en fait le prénom du profil.
        options: { data: { first_name: firstName.trim() }, emailRedirectTo: redirectTo },
      })
      if (error) throw mapSupabaseError(error)
      // Avec la confirmation d'email activée, Supabase ne signale pas un email déjà inscrit (anti-énumération) :
      // il renvoie un utilisateur sans aucune identité.
      if (data.user && data.user.identities?.length === 0) throw new AuthError('emailTaken')
      if (data.session && data.user) return { user: toAuthUser(data.user), needsEmailConfirmation: false }
      return { needsEmailConfirmation: true }
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw mapSupabaseError(error)
      return toAuthUser(data.user)
    },

    async signInWithProvider(provider) {
      // On navigue nous-mêmes (skipBrowserRedirect) : plus simple à tester, et une éventuelle erreur reste dans l'app.
      const { data, error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } })
      if (error) throw mapSupabaseError(error)
      navigate(data.url)
      return undefined // la page part chez le fournisseur : la session arrive au retour (événement « signedIn »)
    },

    async signOut() {
      // `local` : ferme la session de CET appareil (le défaut, `global`, déconnecterait aussi tous les autres).
      const { error } = await client.auth.signOut({ scope: 'local' })
      if (error) throw mapSupabaseError(error)
    },

    async sendPasswordReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo })
      if (error) throw mapSupabaseError(error)
    },

    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password })
      if (error) throw mapSupabaseError(error)
    },

    async deleteAccount() {
      const { error } = await client.rpc('delete_own_account')
      if (error) throw new Error(`Suppression impossible : ${error.message}`)
      await client.auth.signOut({ scope: 'local' })
    },
  }

  const profiles: ProfileRepository = {
    async load(userID) {
      const { data, error } = await client
        .from('profiles')
        .select(
          'first_name, bio, photo_data, age, athlete_style, visibility_scope, is_invisible, linger_minutes, joined_at, profile_sports(sport_id, is_primary)',
        )
        .eq('id', userID)
        .maybeSingle()
      if (error) throw new Error(`Profil illisible : ${error.message}`)
      if (!data) return undefined
      const row = data as unknown as ProfileRow
      const sports: UserSport[] = (row.profile_sports ?? [])
        .map((s) => ({ sportID: s.sport_id, isPrimary: s.is_primary }))
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || (a.sportID < b.sportID ? -1 : 1))
      return {
        id: userID,
        firstName: row.first_name,
        bio: row.bio,
        photoData: row.photo_data ?? undefined,
        age: row.age ?? undefined,
        athleteStyle: isAthleteStyleID(row.athlete_style) ? row.athlete_style : undefined,
        sports,
        visibility: {
          scope: row.visibility_scope ?? DEFAULT_VISIBILITY.scope,
          isInvisible: row.is_invisible,
          lingerMinutes: row.linger_minutes,
        },
        joinedAt: Date.parse(row.joined_at),
      } satisfies User
    },

    async save(user) {
      const { error } = await client.rpc('save_my_profile', {
        p_first_name: user.firstName,
        p_bio: user.bio,
        p_photo_data: user.photoData ?? null,
        p_scope: user.visibility.scope,
        p_is_invisible: user.visibility.isInvisible,
        p_linger_minutes: user.visibility.lingerMinutes,
        p_sports: user.sports.map((s) => ({ sport_id: s.sportID, is_primary: s.isPrimary })),
        p_age: user.age ?? null,
        p_athlete_style: user.athleteStyle ?? null,
      })
      if (error) throw new Error(`Profil non enregistré : ${error.message}`)
    },
  }

  return { auth, profiles, providers }
}
