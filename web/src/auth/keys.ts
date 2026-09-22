/**
 * Garde-fou : une clé « secrète » (service_role / sb_secret_…) donne un accès total à la base, en contournant
 * les règles RLS. Elle ne doit JAMAIS finir dans une application web. Seule la clé publique (anon / sb_publishable_…)
 * a sa place ici.
 */
export function assertPublicKey(key: string): void {
  if (key.startsWith('sb_secret_')) throw new Error(UNSAFE)
  const payload = key.split('.')[1]
  if (!payload) return
  let role: unknown
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    role = (JSON.parse(json) as { role?: unknown }).role
  } catch {
    return // pas un JWT lisible : on ne peut rien conclure
  }
  if (role === 'service_role') throw new Error(UNSAFE)
}

const UNSAFE =
  "VITE_SUPABASE_ANON_KEY contient une clé SECRÈTE (service_role). Ne la mets jamais dans l'application : utilise la clé publique « anon » / « publishable »."
