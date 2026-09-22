import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ATHLETE_STYLES } from '../../src/core/athleteStyles'
import { CATEGORIES, SPORTS } from '../../src/core/sports'
import { createMigratedDb } from './support'

/**
 * Vérifie la migration SQL sur un vrai Postgres (PGlite) : contraintes, déclencheur d'inscription, RLS, RPC.
 * Supabase est imité au minimum : schéma `auth`, rôles anon/authenticated et privilèges par défaut du schéma public.
 */
let db: PGlite

async function signUp(email: string, metadata: Record<string, unknown> = {}): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`,
    [email, JSON.stringify(metadata)],
  )
  return rows[0]!.id
}

/** Exécute `fn` avec le rôle `authenticated` et l'identité `userId` (comme une requête PostgREST). */
async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}

async function asAnon<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role;`)
  }
}

const save = (overrides: Partial<Record<string, unknown>> = {}) => {
  const p = {
    first_name: 'Léa', bio: '', photo_data: null, scope: 'everyone', invisible: false, linger: 15,
    sports: [{ sport_id: 'ski', is_primary: true }, { sport_id: 'trail', is_primary: false }],
    ...overrides,
  }
  return db.query(`select public.save_my_profile($1, $2, $3, $4, $5, $6, $7::jsonb)`, [
    p.first_name, p.bio, p.photo_data, p.scope, p.invisible, p.linger, JSON.stringify(p.sports),
  ])
}

/** Appel complet, comme le fait l'app (avec l'âge et le style de sportif). */
const saveFull = (age: number | null, style: string | null, sports: unknown[] = [{ sport_id: 'ski', is_primary: true }]) =>
  db.query(`select public.save_my_profile($1, $2, $3, $4, $5, $6, $7::jsonb, $8::smallint, $9)`, [
    'Léa', '', null, 'everyone', false, 15, JSON.stringify(sports), age, style,
  ])

const constraintValues = async (name: string): Promise<string[]> => {
  const { rows } = await db.query<{ def: string }>(`select pg_get_constraintdef(oid) as def from pg_constraint where conname = $1`, [name])
  return [...rows[0]!.def.matchAll(/'([^']+)'::text/g)].map((m) => m[1]!).sort()
}

beforeAll(async () => {
  db = await createMigratedDb()
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.exec(`truncate auth.users cascade`)
})

describe('catalogue des sports', () => {
  it('correspond exactement au catalogue de l\'app (mêmes ids, noms et catégories)', async () => {
    const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : 1) // même tri des deux côtés : l'ordre de la base dépend de sa collation
    const { rows } = await db.query<{ id: string; name: string; category: string }>(`select id, name, category from public.sports`)
    const expected = SPORTS.map((s) => ({ id: s.id, name: s.name, category: s.category })).sort(byId)
    expect(rows.sort(byId)).toEqual(expected)
  })

  it('est lisible par tout le monde mais non modifiable', async () => {
    expect((await asAnon(() => db.query(`select id from public.sports`))).rows).toHaveLength(SPORTS.length)
    const user = await signUp('a@example.com')
    await asUser(user, async () => {
      await expect(db.query(`insert into public.sports (id, name, category) values ('x', 'X', 'eau')`)).rejects.toThrow(/permission denied/)
    })
    await asAnon(async () => {
      await expect(db.query(`delete from public.sports`)).rejects.toThrow(/permission denied/)
    })
  })
})

describe('catalogue élargi', () => {
  it('les catégories autorisées par la base sont exactement celles de l\'app', async () => {
    expect(await constraintValues('sports_category_check')).toEqual([...CATEGORIES].sort())
  })

  it('refuse une catégorie inconnue', async () => {
    await expect(db.query(`insert into public.sports (id, name, category) values ('curling', 'Curling', 'glace')`)).rejects.toThrow(/check constraint/)
  })

  it('les 14 sports d\'origine gardent leur id et leur nom (des profils y sont peut-être déjà rattachés)', async () => {
    const original: Record<string, string> = {
      ski: 'Ski', snowboard: 'Snowboard', surf: 'Surf', running: 'Course à pied', trail: 'Trail', velo: 'Vélo', football: 'Football',
      basket: 'Basket', tennis: 'Tennis', musculation: 'Musculation', yoga: 'Yoga', randonnee: 'Randonnée', escalade: 'Escalade', natation: 'Natation',
    }
    const { rows } = await db.query<{ id: string; name: string }>(`select id, name from public.sports where id = any($1)`, [Object.keys(original)])
    expect(Object.fromEntries(rows.map((r) => [r.id, r.name]))).toEqual(original)
  })
})

describe('création du profil à l\'inscription', () => {
  it('reprend le prénom des métadonnées d\'inscription', async () => {
    const id = await signUp('lea@example.com', { first_name: '  Léa  ' })
    const { rows } = await db.query<{ first_name: string; visibility_scope: string; linger_minutes: number; is_invisible: boolean }>(
      `select first_name, visibility_scope, linger_minutes, is_invisible from public.profiles where id = $1`, [id])
    expect(rows).toEqual([{ first_name: 'Léa', visibility_scope: 'everyone', linger_minutes: 15, is_invisible: false }])
  })

  it('ne fait jamais échouer l\'inscription : repli sur l\'email, puis sur « Sportif », et tronque à 30 caractères', async () => {
    const fromEmail = await signUp('marc.dupont@example.com')
    const empty = await signUp('', { first_name: '   ' })
    const nullEmail = await db.query<{ id: string }>(`insert into auth.users (email) values (null) returning id`).then((r) => r.rows[0]!.id)
    const long = await signUp('long@example.com', { first_name: 'A'.repeat(80) })
    const names = async (id: string) => (await db.query<{ first_name: string }>(`select first_name from public.profiles where id = $1`, [id])).rows[0]!.first_name
    expect(await names(fromEmail)).toBe('marc.dupont')
    expect(await names(empty)).toBe('Sportif')
    expect(await names(nullEmail)).toBe('Sportif')
    expect(await names(long)).toBe('A'.repeat(30))
  })

  it('avec Google (pas de first_name) : prénom = given_name, sinon premier mot du nom complet, sinon de « name »', async () => {
    const names = async (id: string) => (await db.query<{ first_name: string }>(`select first_name from public.profiles where id = $1`, [id])).rows[0]!.first_name
    const given = await signUp('a@example.com', { given_name: ' Léa ', full_name: 'Léa Martin', name: 'Léa Martin' })
    const full = await signUp('b@example.com', { full_name: 'Jean-Pierre Dupont', name: 'JP D.' })
    const plain = await signUp('c@example.com', { name: 'Camille Durand' })
    const form = await signUp('d@example.com', { first_name: 'Zoé', given_name: 'Zoe', full_name: 'Zoe Ng' })
    const blank = await signUp('marc@example.com', { given_name: '  ', full_name: '   ', name: '' })
    const odd = await signUp('odd@example.com', { given_name: 42, full_name: null })
    expect(await names(given)).toBe('Léa')
    expect(await names(full)).toBe('Jean-Pierre')
    expect(await names(plain)).toBe('Camille')
    expect(await names(form)).toBe('Zoé') // le champ du formulaire d'inscription reste prioritaire
    expect(await names(blank)).toBe('marc')
    expect(await names(odd)).toBe('42') // une métadonnée inattendue ne fait jamais échouer l'inscription
  })

  it('la fonction du déclencheur n\'est appelable par aucun rôle de l\'API', async () => {
    const user = await signUp('a@example.com')
    await asUser(user, async () => {
      await expect(db.query(`select public.handle_new_user()`)).rejects.toThrow(/permission denied/)
    })
  })
})

describe('règles d\'accès (RLS)', () => {
  it('chacun ne lit que son propre profil ; les anonymes ne lisent rien', async () => {
    const a = await signUp('a@example.com', { first_name: 'Alice' })
    const b = await signUp('b@example.com', { first_name: 'Bob' })
    expect((await asUser(a, () => db.query<{ first_name: string }>(`select first_name from public.profiles`))).rows).toEqual([{ first_name: 'Alice' }])
    expect((await asUser(b, () => db.query<{ first_name: string }>(`select first_name from public.profiles`))).rows).toEqual([{ first_name: 'Bob' }])
    await asAnon(async () => {
      await expect(db.query(`select * from public.profiles`)).rejects.toThrow(/permission denied/)
    })
  })

  it('on ne modifie pas le profil d\'un autre', async () => {
    const a = await signUp('a@example.com', { first_name: 'Alice' })
    const b = await signUp('b@example.com', { first_name: 'Bob' })
    const result = await asUser(a, () => db.query(`update public.profiles set first_name = 'Pirate' where id = $1`, [b]))
    expect(result.affectedRows).toBe(0)
    expect((await db.query<{ first_name: string }>(`select first_name from public.profiles where id = $1`, [b])).rows[0]!.first_name).toBe('Bob')
  })

  it('on ne crée pas un profil au nom d\'un autre, et l\'identifiant d\'un profil n\'est pas modifiable', async () => {
    const a = await signUp('a@example.com')
    const b = await signUp('b@example.com')
    await db.exec(`delete from public.profiles`)
    await asUser(a, async () => {
      await expect(db.query(`insert into public.profiles (id, first_name) values ($1, 'Usurpateur')`, [b])).rejects.toThrow(/row-level security/)
      await expect(db.query(`update public.profiles set id = $1`, [b])).rejects.toThrow(/permission denied/) // pas de droit UPDATE sur id
    })
  })

  it('l\'ancienneté (joined_at) n\'est pas modifiable par le client', async () => {
    const a = await signUp('a@example.com')
    await asUser(a, async () => {
      await expect(db.query(`update public.profiles set joined_at = '2000-01-01'`)).rejects.toThrow(/permission denied/)
    })
  })

  it('les sports pratiqués sont isolés par utilisateur', async () => {
    const a = await signUp('a@example.com')
    const b = await signUp('b@example.com')
    await asUser(a, () => save())
    await asUser(b, () => save({ sports: [{ sport_id: 'yoga', is_primary: true }] }))
    expect((await asUser(a, () => db.query<{ sport_id: string }>(`select sport_id from public.profile_sports order by sport_id`))).rows.map((r) => r.sport_id)).toEqual(['ski', 'trail'])
    expect((await asUser(b, () => db.query<{ sport_id: string }>(`select sport_id from public.profile_sports`))).rows.map((r) => r.sport_id)).toEqual(['yoga'])
    const stolen = await asUser(a, () => db.query(`delete from public.profile_sports where user_id = $1`, [b]))
    expect(stolen.affectedRows).toBe(0)
    await expect(asUser(a, () => db.query(`insert into public.profile_sports (user_id, sport_id) values ($1, 'surf')`, [b]))).rejects.toThrow(/row-level security/)
  })
})

describe('save_my_profile', () => {
  it('enregistre le profil et les sports, puis remplace les sports au second appel', async () => {
    const a = await signUp('a@example.com', { first_name: 'Alice' })
    await asUser(a, () => save({ first_name: '  Léa ', bio: 'Ski l\'hiver', scope: 'mySports', invisible: true, linger: 30 }))

    let profile = (await asUser(a, () => db.query(`select first_name, bio, visibility_scope, is_invisible, linger_minutes from public.profiles`))).rows[0]
    expect(profile).toEqual({ first_name: 'Léa', bio: 'Ski l\'hiver', visibility_scope: 'mySports', is_invisible: true, linger_minutes: 30 })
    let sports = (await asUser(a, () => db.query(`select sport_id, is_primary from public.profile_sports order by sport_id`))).rows
    expect(sports).toEqual([{ sport_id: 'ski', is_primary: true }, { sport_id: 'trail', is_primary: false }])

    await asUser(a, () => save({ sports: [{ sport_id: 'running', is_primary: true }] }))
    sports = (await asUser(a, () => db.query(`select sport_id, is_primary from public.profile_sports`))).rows
    expect(sports).toEqual([{ sport_id: 'running', is_primary: true }])
    profile = (await asUser(a, () => db.query(`select first_name from public.profiles`))).rows[0]
    expect(profile).toEqual({ first_name: 'Léa' })
  })

  it('crée le profil s\'il n\'existe pas (déclencheur absent ou en échec)', async () => {
    const a = await signUp('a@example.com')
    await db.exec(`delete from public.profiles`)
    await asUser(a, () => save({ first_name: 'Nouveau' }))
    expect((await db.query<{ first_name: string }>(`select first_name from public.profiles where id = $1`, [a])).rows[0]!.first_name).toBe('Nouveau')
  })

  it('est atomique : une erreur ne laisse ni profil modifié ni sports perdus', async () => {
    const a = await signUp('a@example.com', { first_name: 'Alice' })
    await asUser(a, () => save())
    await expect(asUser(a, () => save({ first_name: 'Changé', sports: [{ sport_id: 'ski', is_primary: true }, { sport_id: 'trail', is_primary: true }] }))).rejects.toThrow(/unique|duplicate/i)
    expect((await db.query<{ first_name: string }>(`select first_name from public.profiles where id = $1`, [a])).rows[0]!.first_name).toBe('Léa')
    expect((await db.query(`select 1 from public.profile_sports where user_id = $1`, [a])).rows).toHaveLength(2)
  })

  it('refuse les données invalides', async () => {
    const a = await signUp('a@example.com')
    await asUser(a, async () => {
      await expect(save({ sports: [{ sport_id: 'curling', is_primary: true }] })).rejects.toThrow(/foreign key|violates/i)
      await expect(save({ scope: 'tout-le-monde-et-sa-mere' })).rejects.toThrow(/check constraint/)
      await expect(save({ linger: 7 })).rejects.toThrow(/check constraint/)
      await expect(save({ bio: 'x'.repeat(141) })).rejects.toThrow(/check constraint/)
      await expect(save({ first_name: '   ' })).rejects.toThrow(/check constraint/)
      await expect(save({ first_name: 'B'.repeat(31) })).rejects.toThrow(/check constraint/)
      await expect(save({ photo_data: 'p'.repeat(200_001) })).rejects.toThrow(/check constraint/)
    })
  })

  it('exige d\'être connecté', async () => {
    await expect(save()).rejects.toThrow(/not authenticated/)
    await asAnon(async () => {
      await expect(save()).rejects.toThrow(/permission denied/)
    })
  })
})

describe('profil : âge et style de sportif', () => {
  it('save_my_profile enregistre l\'âge et le style, et une nouvelle sauvegarde les remplace', async () => {
    const a = await signUp('a@example.com', { first_name: 'Alice' })
    await asUser(a, () => saveFull(27, 'adventurer'))
    const read = () => asUser(a, () => db.query(`select age, athlete_style from public.profiles`)).then((r) => r.rows[0])
    expect(await read()).toEqual({ age: 27, athlete_style: 'adventurer' })

    await asUser(a, () => saveFull(28, 'competitor'))
    expect(await read()).toEqual({ age: 28, athlete_style: 'competitor' })
  })

  it('les styles autorisés par la base sont exactement ceux de l\'app', async () => {
    expect(await constraintValues('profiles_athlete_style_check')).toEqual(ATHLETE_STYLES.map((s) => s.id).sort())
    const a = await signUp('a@example.com')
    for (const style of ATHLETE_STYLES) await asUser(a, () => saveFull(30, style.id))
  })

  it('l\'ancien appel à 7 paramètres fonctionne toujours (app déjà en ligne pendant la mise à jour)', async () => {
    const a = await signUp('a@example.com', { first_name: 'Alice' })
    await asUser(a, () => save())
    expect((await asUser(a, () => db.query(`select age, athlete_style from public.profiles`))).rows[0]).toEqual({ age: null, athlete_style: null })
  })

  it('refuse un âge hors bornes et un style inconnu', async () => {
    const a = await signUp('a@example.com')
    await asUser(a, async () => {
      await expect(saveFull(12, 'fun')).rejects.toThrow(/check constraint/)
      await expect(saveFull(121, 'fun')).rejects.toThrow(/check constraint/)
      await expect(saveFull(30, 'super-heros')).rejects.toThrow(/check constraint/)
    })
  })

  it('chacun ne modifie que son propre âge et style ; les anonymes rien', async () => {
    const a = await signUp('a@example.com')
    const b = await signUp('b@example.com')
    const own = await asUser(a, () => db.query(`update public.profiles set age = 40, athlete_style = 'zen' where id = $1`, [a]).catch((e: Error) => e))
    expect(String(own)).toMatch(/check constraint/) // 'zen' n'existe pas : rejeté, mais le droit de modifier la colonne est bien accordé
    const ok = await asUser(a, () => db.query(`update public.profiles set age = 40, athlete_style = 'wellbeing' where id = $1`, [a]))
    expect(ok.affectedRows).toBe(1)
    const other = await asUser(a, () => db.query(`update public.profiles set age = 99 where id = $1`, [b]))
    expect(other.affectedRows).toBe(0)
    await asAnon(async () => {
      await expect(db.query(`update public.profiles set age = 1`)).rejects.toThrow(/permission denied/)
    })
  })
})

describe('delete_own_account', () => {
  it('supprime le compte, le profil et les sports — sans toucher aux autres', async () => {
    const a = await signUp('a@example.com', { first_name: 'Alice' })
    const b = await signUp('b@example.com', { first_name: 'Bob' })
    await asUser(a, () => save())
    await asUser(b, () => save({ first_name: 'Bob', sports: [{ sport_id: 'yoga', is_primary: true }] }))

    await asUser(a, () => db.query(`select public.delete_own_account()`))

    expect((await db.query(`select id from auth.users`)).rows).toEqual([{ id: b }])
    expect((await db.query(`select id from public.profiles`)).rows).toEqual([{ id: b }])
    expect((await db.query(`select user_id from public.profile_sports`)).rows).toEqual([{ user_id: b }])
  })

  it('exige d\'être connecté', async () => {
    await signUp('a@example.com')
    await asAnon(async () => {
      await expect(db.query(`select public.delete_own_account()`)).rejects.toThrow(/permission denied/)
    })
    expect((await db.query(`select id from auth.users`)).rows).toHaveLength(1)
  })
})
