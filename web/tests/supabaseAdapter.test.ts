import type { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createSupabaseAccounts, mapSupabaseError } from '../src/auth/supabase'
import { AuthError } from '../src/auth/types'
import type { User } from '../src/core/models'
import { createMigratedDb } from './sql/support'

/**
 * L'adaptateur Supabase est testé contre de fausses réponses HTTP (aucun serveur réel disponible ici) et
 * RECOUPÉ avec la migration SQL : les noms de paramètres de la fonction et les colonnes lues doivent exister.
 */
const URL_BASE = 'https://projet.supabase.co'
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
const fakeJwt = (payload: object) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`
const ANON_KEY = fakeJwt({ role: 'anon' })

const USER_ID = '11111111-1111-4111-8111-111111111111'
const supabaseUser = (email = 'lea@example.com', identities: unknown[] = [{ id: USER_ID, provider: 'email' }]) => ({
  id: USER_ID, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: { first_name: 'Léa' },
  created_at: '2026-09-21T10:00:00Z', identities,
})
const supabaseSession = () => ({
  access_token: fakeJwt({ sub: USER_ID, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
  token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh', user: supabaseUser(),
})

interface Call {
  method: string
  path: string
  query: URLSearchParams
  body: any
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const empty = (status = 204) => new Response(null, { status })
/** Forme réelle des erreurs de Supabase Auth (GoTrue) : `code` = statut HTTP, `error_code` = code texte. */
const authError = (status: number, error_code: string, msg: string) => json({ code: status, error_code, msg }, status)

/** Remplace `fetch` : chaque requête est enregistrée puis traitée par `handler`. */
function stubFetch(handler: (call: Call) => Response) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const call: Call = { method: (init?.method ?? 'GET').toUpperCase(), path: url.pathname, query: url.searchParams, body: init?.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(call)
    return handler(call)
  })
  return calls
}

let db: PGlite
beforeAll(async () => {
  db = await createMigratedDb()
})
afterAll(async () => {
  await db.close()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('inscription et connexion', () => {
  it('signUp envoie le prénom en métadonnées (lu par le déclencheur SQL) et signale la confirmation d\'email', async () => {
    const calls = stubFetch(() => json(supabaseUser()))
    const { auth } = createSupabaseAccounts(URL_BASE, ANON_KEY)

    const result = await auth.signUp({ email: ' lea@example.com ', password: 'motdepasse1', firstName: '  Léa ' })

    expect(result).toEqual({ needsEmailConfirmation: true })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/auth/v1/signup' })
    expect(calls[0]!.body).toMatchObject({ email: 'lea@example.com', password: 'motdepasse1', data: { first_name: 'Léa' } })
  })

  it('signUp ouvre directement la session quand la confirmation d\'email est désactivée', async () => {
    stubFetch(() => json(supabaseSession()))
    const { auth } = createSupabaseAccounts(URL_BASE, ANON_KEY)
    expect(await auth.signUp({ email: 'lea@example.com', password: 'motdepasse1', firstName: 'Léa' })).toEqual({
      user: { id: USER_ID, email: 'lea@example.com' },
      needsEmailConfirmation: false,
    })
  })

  it('signUp détecte un email déjà inscrit (Supabase répond sans erreur mais sans identité)', async () => {
    stubFetch(() => json(supabaseUser('lea@example.com', [])))
    const { auth } = createSupabaseAccounts(URL_BASE, ANON_KEY)
    await expect(auth.signUp({ email: 'lea@example.com', password: 'motdepasse1', firstName: 'Léa' })).rejects.toMatchObject({ code: 'emailTaken' })
  })

  it('signIn renvoie l\'utilisateur ; les erreurs sont traduites en messages français', async () => {
    let response: Response = json(supabaseSession())
    const calls = stubFetch(() => response)
    const { auth } = createSupabaseAccounts(URL_BASE, ANON_KEY)

    expect(await auth.signIn('lea@example.com', 'motdepasse1')).toEqual({ id: USER_ID, email: 'lea@example.com' })
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/auth/v1/token' })
    expect(calls[0]!.query.get('grant_type')).toBe('password')

    response = authError(400, 'invalid_credentials', 'Invalid login credentials')
    await expect(auth.signIn('lea@example.com', 'x')).rejects.toThrow('Email ou mot de passe incorrect.')
    response = authError(400, 'email_not_confirmed', 'Email not confirmed')
    await expect(auth.signIn('lea@example.com', 'x')).rejects.toMatchObject({ code: 'emailNotConfirmed' })
    response = authError(429, 'over_request_rate_limit', 'Request rate limit reached')
    await expect(auth.signIn('lea@example.com', 'x')).rejects.toMatchObject({ code: 'rateLimited' })
  })

  it('une coupure réseau donne un message de connexion, pas une erreur technique', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    const { auth } = createSupabaseAccounts(URL_BASE, ANON_KEY)
    await expect(auth.signIn('lea@example.com', 'motdepasse1')).rejects.toMatchObject({ code: 'network' })
  })

  it('la déconnexion ne ferme que la session de CET appareil (scope local)', async () => {
    const calls = stubFetch((call) => (call.path === '/auth/v1/token' ? json(supabaseSession()) : empty()))
    const { auth } = createSupabaseAccounts(URL_BASE, ANON_KEY)
    await auth.signIn('lea@example.com', 'motdepasse1')
    await auth.signOut()
    const logout = calls.find((c) => c.path === '/auth/v1/logout')
    expect(logout?.query.get('scope')).toBe('local')
  })

  it('restore sans session mémorisée ne fait aucune requête', async () => {
    const calls = stubFetch(() => empty())
    const { auth } = createSupabaseAccounts(URL_BASE, ANON_KEY)
    expect(await auth.restore()).toEqual({ user: undefined, recovery: false, linkError: undefined })
    expect(calls).toHaveLength(0)
  })

  it('mot de passe oublié et nouveau mot de passe appellent les bons points d\'entrée', async () => {
    const calls = stubFetch((call) => (call.path === '/auth/v1/token' ? json(supabaseSession()) : call.path === '/auth/v1/user' ? json(supabaseUser()) : json({})))
    const { auth } = createSupabaseAccounts(URL_BASE, ANON_KEY)
    await auth.sendPasswordReset(' lea@example.com ')
    expect(calls.find((c) => c.path === '/auth/v1/recover')?.body).toMatchObject({ email: 'lea@example.com' })

    await auth.signIn('lea@example.com', 'motdepasse1')
    await auth.updatePassword('nouveau-mdp-123')
    const update = calls.find((c) => c.path === '/auth/v1/user' && c.method === 'PUT')
    expect(update?.body).toMatchObject({ password: 'nouveau-mdp-123' })
  })

  it('traduit les codes d\'erreur Supabase courants', () => {
    const err = (code: string, status = 400) => Object.assign(new Error(code), { code, status, name: 'AuthApiError' })
    const map = (e: Error) => mapSupabaseError(e as never)
    expect(map(err('weak_password')).code).toBe('weakPassword')
    expect(map(err('user_already_exists')).code).toBe('emailTaken')
    expect(map(err('email_address_not_authorized')).code).toBe('emailNotAuthorized')
    expect(map(err('signup_disabled')).code).toBe('signupDisabled')
    expect(map(err('quelque_chose_d_inconnu')).code).toBe('unknown')
    expect(map(err('x', 429)).code).toBe('rateLimited')
    expect(map(err('otp_expired')).message).toMatch(/expiré/)
    expect(map(err('x')) instanceof AuthError).toBe(true)
  })

  it('refuse de démarrer avec une clé secrète', () => {
    expect(() => createSupabaseAccounts(URL_BASE, 'sb_secret_abc')).toThrow(/SECRÈTE/)
    expect(() => createSupabaseAccounts(URL_BASE, fakeJwt({ role: 'service_role' }))).toThrow(/SECRÈTE/)
  })
})

describe('profils (recoupés avec la migration SQL)', () => {
  const profile: User = {
    id: USER_ID, firstName: 'Léa', bio: 'Ski l\'hiver', photoData: 'data:image/jpeg;base64,AAAA', age: 27, athleteStyle: 'adventurer',
    sports: [{ sportID: 'trail', isPrimary: false }, { sportID: 'ski', isPrimary: true }],
    visibility: { scope: 'mySports', isInvisible: true, lingerMinutes: 30 }, joinedAt: Date.parse('2026-09-01T08:00:00Z'),
  }

  it('save appelle save_my_profile avec exactement les paramètres déclarés dans le SQL', async () => {
    const calls = stubFetch((call) => (call.path === '/auth/v1/token' ? json(supabaseSession()) : empty()))
    const { auth, profiles } = createSupabaseAccounts(URL_BASE, ANON_KEY)
    await auth.signIn('lea@example.com', 'motdepasse1')
    await profiles.save(profile)

    const rpc = calls.find((c) => c.path === '/rest/v1/rpc/save_my_profile')!
    expect(rpc.method).toBe('POST')

    // Noms de paramètres : PostgREST exige la correspondance exacte avec la fonction SQL.
    const { rows } = await db.query<{ proargnames: string[] }>(`select proargnames from pg_proc where proname = 'save_my_profile'`)
    expect(Object.keys(rpc.body).sort()).toEqual([...rows[0]!.proargnames].sort())

    expect(rpc.body).toEqual({
      p_first_name: 'Léa', p_bio: 'Ski l\'hiver', p_photo_data: 'data:image/jpeg;base64,AAAA', p_scope: 'mySports',
      p_is_invisible: true, p_linger_minutes: 30, p_age: 27, p_athlete_style: 'adventurer',
      p_sports: [{ sport_id: 'trail', is_primary: false }, { sport_id: 'ski', is_primary: true }],
    })
  })

  it('load lit des colonnes qui existent et reconstitue le profil (sport principal en premier)', async () => {
    const calls = stubFetch(() =>
      json([{
        first_name: 'Léa', bio: 'Ski l\'hiver', photo_data: null, age: 27, athlete_style: 'competitor', visibility_scope: 'mySports', is_invisible: true, linger_minutes: 30,
        joined_at: '2026-09-01T08:00:00+00:00',
        profile_sports: [{ sport_id: 'trail', is_primary: false }, { sport_id: 'ski', is_primary: true }, { sport_id: 'escalade', is_primary: false }],
      }]),
    )
    const { profiles } = createSupabaseAccounts(URL_BASE, ANON_KEY)
    const loaded = await profiles.load(USER_ID)

    expect(loaded).toEqual({
      id: USER_ID, firstName: 'Léa', bio: 'Ski l\'hiver', photoData: undefined, age: 27, athleteStyle: 'competitor',
      sports: [{ sportID: 'ski', isPrimary: true }, { sportID: 'escalade', isPrimary: false }, { sportID: 'trail', isPrimary: false }],
      visibility: { scope: 'mySports', isInvisible: true, lingerMinutes: 30 }, joinedAt: Date.parse('2026-09-01T08:00:00Z'),
    })

    // Chaque colonne demandée existe dans la table (et la relation intégrée dans profile_sports).
    const select = calls[0]!.query.get('select')!
    const embedded = select.match(/profile_sports\(([^)]*)\)/)![1]!.split(',').map((c) => c.trim())
    const own = select.replace(/profile_sports\([^)]*\)/, '').split(',').map((c) => c.trim()).filter(Boolean)
    const columns = async (table: string) =>
      (await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`, [table])).rows.map((r) => r.column_name)
    const profileColumns = await columns('profiles')
    const sportColumns = await columns('profile_sports')
    for (const column of own) expect(profileColumns, `colonne profiles.${column}`).toContain(column)
    for (const column of embedded) expect(sportColumns, `colonne profile_sports.${column}`).toContain(column)
    expect(calls[0]!.query.get('id')).toBe(`eq.${USER_ID}`)
  })

  it('load renvoie undefined quand aucun profil n\'existe', async () => {
    stubFetch(() => json([]))
    const { profiles } = createSupabaseAccounts(URL_BASE, ANON_KEY)
    expect(await profiles.load(USER_ID)).toBeUndefined()
  })

  it('une erreur du serveur est remontée avec un message lisible', async () => {
    stubFetch(() => json({ code: '42501', message: 'permission denied for table profiles' }, 403))
    const { profiles } = createSupabaseAccounts(URL_BASE, ANON_KEY)
    await expect(profiles.load(USER_ID)).rejects.toThrow(/Profil illisible/)
    await expect(profiles.save(profile)).rejects.toThrow(/Profil non enregistré/)
  })

  it('deleteAccount appelle delete_own_account (fonction qui existe dans le SQL) puis ferme la session locale', async () => {
    const calls = stubFetch((call) => (call.path === '/auth/v1/token' ? json(supabaseSession()) : empty()))
    const { auth } = createSupabaseAccounts(URL_BASE, ANON_KEY)
    await auth.signIn('lea@example.com', 'motdepasse1')
    await auth.deleteAccount()

    const paths = calls.map((c) => c.path)
    expect(paths.indexOf('/rest/v1/rpc/delete_own_account')).toBeGreaterThan(-1)
    expect(paths.indexOf('/auth/v1/logout')).toBeGreaterThan(paths.indexOf('/rest/v1/rpc/delete_own_account'))
    const { rows } = await db.query(`select 1 from pg_proc where proname = 'delete_own_account'`)
    expect(rows).toHaveLength(1)
  })
})

describe('âge et style de sportif (recoupés avec la migration SQL)', () => {
  it('un style inconnu ou un âge absent en base donnent un profil sans ces champs (pas d\'erreur)', async () => {
    stubFetch(() =>
      json([{
        first_name: 'Léa', bio: '', photo_data: null, age: null, athlete_style: 'style-inconnu', visibility_scope: 'everyone', is_invisible: false,
        linger_minutes: 15, joined_at: '2026-09-01T08:00:00+00:00', profile_sports: [],
      }]),
    )
    const { profiles } = createSupabaseAccounts(URL_BASE, ANON_KEY)
    expect(await profiles.load(USER_ID)).toMatchObject({ age: undefined, athleteStyle: undefined, sports: [] })
  })

  it('save envoie null quand l\'âge et le style ne sont pas renseignés (paramètres facultatifs côté SQL)', async () => {
    const calls = stubFetch((call) => (call.path === '/auth/v1/token' ? json(supabaseSession()) : empty()))
    const { auth, profiles } = createSupabaseAccounts(URL_BASE, ANON_KEY)
    await auth.signIn('lea@example.com', 'motdepasse1')
    await profiles.save({ id: USER_ID, firstName: 'Léa', bio: '', sports: [], visibility: { scope: 'everyone', isInvisible: false, lingerMinutes: 15 }, joinedAt: 0 })
    const rpc = calls.find((c) => c.path === '/rest/v1/rpc/save_my_profile')!
    expect(rpc.body).toMatchObject({ p_age: null, p_athlete_style: null })
  })
})

describe('connexion avec Google', () => {
  it('signInWithProvider ouvre l\'adresse d\'autorisation de Supabase, sans autre requête', async () => {
    vi.stubGlobal('location', { origin: 'https://goat.example', hash: '', search: '' })
    const calls = stubFetch(() => empty())
    const navigate = vi.fn()
    const accounts = createSupabaseAccounts(URL_BASE, ANON_KEY, { providers: ['google'], navigate })
    expect(accounts.providers).toEqual(['google'])

    expect(await accounts.auth.signInWithProvider('google')).toBeUndefined()

    expect(calls).toHaveLength(0)
    expect(navigate).toHaveBeenCalledTimes(1)
    const target = new URL(navigate.mock.calls[0]![0])
    expect(target.origin + target.pathname).toBe(`${URL_BASE}/auth/v1/authorize`)
    expect(target.searchParams.get('provider')).toBe('google')
    expect(target.searchParams.get('redirect_to')).toBe('https://goat.example')
  })

  it('sans option : aucun fournisseur', () => {
    expect(createSupabaseAccounts(URL_BASE, ANON_KEY).providers).toEqual([])
  })

  it('au retour d\'une connexion annulée ou refusée, restore() donne un message clair', async () => {
    vi.stubGlobal('location', { origin: 'https://goat.example', hash: '#error=access_denied&error_code=bad_oauth_callback&error_description=Access+denied', search: '' })
    stubFetch(() => empty())
    const { auth } = createSupabaseAccounts(URL_BASE, ANON_KEY)
    expect(await auth.restore()).toMatchObject({ user: undefined, linkError: 'La connexion a été annulée ou a échoué. Réessaie.' })
  })

  it('un lien d\'email expiré garde son propre message', async () => {
    vi.stubGlobal('location', { origin: 'https://goat.example', hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', search: '' })
    stubFetch(() => empty())
    const { auth } = createSupabaseAccounts(URL_BASE, ANON_KEY)
    expect((await auth.restore()).linkError).toMatch(/expiré/)
  })
})
