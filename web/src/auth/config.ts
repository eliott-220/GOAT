import { MemoryAccounts } from './memory'
import { parseProviders } from './providers'
import { createSupabaseAccounts } from './supabase'
import type { Accounts } from './types'

/**
 * Choisit le mode de l'app :
 * - `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` définis → vrais comptes (Supabase). `VITE_AUTH_PROVIDERS` (ex. « google »)
 *   y ajoute les boutons « Continuer avec … » : à ne renseigner qu'une fois le fournisseur activé dans Supabase ;
 * - sinon → mode démo local, sans compte ;
 * - en développement uniquement : `?auth=memory` (comptes fictifs), `?auth=memory-confirm` (avec confirmation d'email)
 *   ou `?auth=memory-google` (avec un bouton Google simulé).
 */
export function createAccounts(): Accounts | undefined {
  if (import.meta.env.DEV && typeof location !== 'undefined') {
    const mode = new URLSearchParams(location.search).get('auth')
    if (mode === 'memory') return new MemoryAccounts()
    if (mode === 'memory-confirm') return new MemoryAccounts({ requireEmailConfirmation: true })
    if (mode === 'memory-google') return new MemoryAccounts({ providers: ['google'] })
  }
  const url: string | undefined = import.meta.env.VITE_SUPABASE_URL
  const key: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY
  const providers = parseProviders(import.meta.env.VITE_AUTH_PROVIDERS)
  return url && key ? createSupabaseAccounts(url, key, { providers }) : undefined
}
