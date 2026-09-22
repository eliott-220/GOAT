/**
 * Connexions « sociales » (OAuth), en plus de l'email et du mot de passe.
 * Seul Google est pris en charge : Sign in with Apple exige un compte Apple Developer payant. Pour l'ajouter le moment venu :
 * un bouton aux couleurs d'Apple, et une étape « prénom » à l'onboarding (Apple ne transmet pas le prénom à Supabase).
 */
export type OAuthProvider = 'google'

/** Nom affiché dans les boutons « Continuer avec … ». */
export const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: 'Google',
}

/**
 * Lit `VITE_AUTH_PROVIDERS` (ex. « google »). Un bouton ne doit apparaître que si le fournisseur est réellement activé dans
 * Supabase : sinon le clic mène à une page d'erreur de Supabase. Les noms inconnus sont ignorés.
 */
export function parseProviders(raw: string | undefined): OAuthProvider[] {
  const wanted = new Set((raw ?? '').split(',').map((name) => name.trim().toLowerCase()))
  return (Object.keys(OAUTH_PROVIDER_LABELS) as OAuthProvider[]).filter((provider) => wanted.has(provider))
}
