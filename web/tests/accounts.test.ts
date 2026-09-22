import { afterEach, describe, expect, it } from 'vitest'
import { assertPublicKey } from '../src/auth/keys'
import { MemoryAccounts } from '../src/auth/memory'
import type { Accounts, ProfileRepository } from '../src/auth/types'
import { InMemoryBackend } from '../src/core/memoryBackend'
import type { UserSport } from '../src/core/models'
import type { ProfileDetails } from '../src/core/profileRules'
import { AppState } from '../src/state/appState'
import { MemoryProfileStore } from '../src/state/storage'

const started: AppState[] = []

function makeApp(accounts: Accounts = new MemoryAccounts()) {
  const app = new AppState({ backend: new InMemoryBackend(), accounts, store: new MemoryProfileStore() })
  started.push(app)
  return app
}

afterEach(() => {
  // Arrête les boucles de rafraîchissement lancées par les apps « prêtes ».
  for (const app of started.splice(0)) app.setForeground(false)
})

const SPORTS: UserSport[] = [{ sportID: 'ski', isPrimary: true }, { sportID: 'trail', isPrimary: false }]
const SIGN_UP = { email: 'lea@example.com', password: 'motdepasse1', firstName: 'Léa' }
const DETAILS: ProfileDetails = { firstName: 'Léa', age: 27, athleteStyle: 'adventurer', sports: SPORTS }

async function signUpAndOnboard(app: AppState) {
  await app.bootstrap()
  await app.signUp(SIGN_UP)
  await app.completeOnboarding(DETAILS)
}

describe('démarrage', () => {
  it('sans session : écran de connexion', async () => {
    const app = makeApp()
    await app.bootstrap()
    expect(app.getSnapshot()).toMatchObject({ phase: 'signedOut', hasAccounts: true })
    expect(app.getSnapshot().me).toBeUndefined()
  })

  it('sans comptes configurés : mode démo local (onboarding sans compte)', async () => {
    const app = new AppState({ backend: new InMemoryBackend(), store: new MemoryProfileStore() })
    started.push(app)
    await app.bootstrap()
    expect(app.getSnapshot()).toMatchObject({ phase: 'onboarding', hasAccounts: false })
  })
})

describe('inscription', () => {
  it('crée le compte, demande les sports, puis enregistre le profil sur le compte', async () => {
    const accounts = new MemoryAccounts()
    const app = makeApp(accounts)
    await app.bootstrap()

    await app.signUp(SIGN_UP)
    let snap = app.getSnapshot()
    expect(snap.phase).toBe('onboarding')
    expect(snap.authBusy).toBe(false)
    expect(snap.accountEmail).toBe('lea@example.com')
    expect(snap.me).toMatchObject({ firstName: 'Léa', sports: [] })

    await app.completeOnboarding(DETAILS)
    snap = app.getSnapshot()
    expect(snap.phase).toBe('ready')
    const stored = await accounts.profiles.load(snap.me!.id)
    expect(stored).toMatchObject({ firstName: 'Léa', age: 27, athleteStyle: 'adventurer', sports: SPORTS })
  })

  it('avec confirmation d\'email : pas de session avant le clic sur le lien', async () => {
    const accounts = new MemoryAccounts({ requireEmailConfirmation: true })
    const app = makeApp(accounts)
    await app.bootstrap()

    await app.signUp(SIGN_UP)
    expect(app.getSnapshot()).toMatchObject({ phase: 'signedOut', authNotice: { kind: 'confirmEmail', email: 'lea@example.com' } })
    expect(accounts.sentEmails).toEqual([{ kind: 'confirm', to: 'lea@example.com' }])

    await app.signIn(SIGN_UP.email, SIGN_UP.password)
    expect(app.getSnapshot().authError).toMatch(/pas encore confirmé/)
    expect(app.getSnapshot().phase).toBe('signedOut')

    accounts.confirmEmail(SIGN_UP.email)
    await app.signIn(SIGN_UP.email, SIGN_UP.password)
    expect(app.getSnapshot().phase).toBe('onboarding')
  })

  it('refuse un email déjà inscrit et un mot de passe trop court, sans changer d\'écran', async () => {
    const accounts = new MemoryAccounts()
    await signUpAndOnboard(makeApp(accounts))

    const other = makeApp(accounts)
    await other.bootstrap() // même « navigateur » : la session de la 1re app est reprise, on s'en déconnecte
    await other.signOut()
    await other.signUp(SIGN_UP)
    expect(other.getSnapshot()).toMatchObject({ phase: 'signedOut', authError: expect.stringMatching(/existe déjà/) })

    await other.signUp({ email: 'autre@example.com', password: 'court', firstName: 'Bob' })
    expect(other.getSnapshot()).toMatchObject({ phase: 'signedOut', authError: expect.stringMatching(/8 caractères/) })
  })
})

describe('connexion, déconnexion et reprise de session', () => {
  it('mauvais mot de passe : message clair, on reste déconnecté', async () => {
    const accounts = new MemoryAccounts()
    await signUpAndOnboard(makeApp(accounts))
    const app = makeApp(accounts)
    await app.bootstrap() // (la session de la 1re app est encore ouverte : on repart d'une déconnexion)
    await app.signOut()
    await app.signIn(SIGN_UP.email, 'pas-le-bon')
    expect(app.getSnapshot()).toMatchObject({ phase: 'signedOut', authBusy: false, authError: 'Email ou mot de passe incorrect.' })
  })

  it('déconnexion puis reconnexion : le profil enregistré est retrouvé', async () => {
    const accounts = new MemoryAccounts()
    const app = makeApp(accounts)
    await signUpAndOnboard(app)
    app.updateProfile((user) => ({ ...user, bio: 'Ski l\'hiver' }))
    app.setVisibility({ scope: 'mySports', lingerMinutes: 30 })
    await app.whenSaved()

    await app.signOut()
    expect(app.getSnapshot()).toMatchObject({ phase: 'signedOut', accountEmail: undefined, pins: [], mySessions: [] })
    expect(app.getSnapshot().me).toBeUndefined()

    await app.signIn(SIGN_UP.email.toUpperCase(), SIGN_UP.password) // l'email n'est pas sensible à la casse
    const snap = app.getSnapshot()
    expect(snap.phase).toBe('ready')
    expect(snap.me).toMatchObject({ firstName: 'Léa', bio: 'Ski l\'hiver', sports: SPORTS, visibility: { scope: 'mySports', lingerMinutes: 30 } })
  })

  it('une nouvelle ouverture de l\'app retrouve la session', async () => {
    const accounts = new MemoryAccounts()
    await signUpAndOnboard(makeApp(accounts))

    const reopened = makeApp(accounts)
    await reopened.bootstrap()
    expect(reopened.getSnapshot()).toMatchObject({ phase: 'ready', me: { firstName: 'Léa' } })
  })

  it('un compte sans sport (onboarding interrompu) reprend à l\'onboarding', async () => {
    const accounts = new MemoryAccounts()
    const first = makeApp(accounts)
    await first.bootstrap()
    await first.signUp(SIGN_UP) // s'arrête avant le choix des sports

    const reopened = makeApp(accounts)
    await reopened.bootstrap()
    expect(reopened.getSnapshot()).toMatchObject({ phase: 'onboarding', me: { firstName: 'Léa', sports: [] } })
  })

  it('l\'ouverture de session n\'est faite qu\'une fois même si l\'événement « connecté » arrive en double', async () => {
    const accounts = new MemoryAccounts()
    await signUpAndOnboard(makeApp(accounts))
    let loads = 0
    const counting: ProfileRepository = {
      load: (id) => (loads++, accounts.profiles.load(id)),
      save: (user) => accounts.profiles.save(user),
    }
    const app = makeApp({ auth: accounts.auth, profiles: counting })
    await app.bootstrap()
    await app.signOut()
    loads = 0
    await app.signIn(SIGN_UP.email, SIGN_UP.password) // l'événement « connecté » et le retour de signIn arrivent tous deux
    await app.whenSaved()
    expect(loads).toBe(1)
    expect(app.getSnapshot().phase).toBe('ready')
  })
})

describe('mot de passe oublié', () => {
  it('lien reçu par email → nouveau mot de passe → connexion avec celui-ci', async () => {
    const accounts = new MemoryAccounts()
    const first = makeApp(accounts)
    await signUpAndOnboard(first)
    await first.signOut()

    await first.sendPasswordReset(SIGN_UP.email)
    expect(first.getSnapshot().authNotice).toEqual({ kind: 'resetSent', email: 'lea@example.com' })
    expect(accounts.sentEmails).toContainEqual({ kind: 'reset', to: 'lea@example.com' })

    // L'utilisateur ouvre le lien : l'app démarre avec une session de récupération.
    accounts.openRecoveryLink(SIGN_UP.email)
    const app = makeApp(accounts)
    await app.bootstrap()
    expect(app.getSnapshot().passwordRecovery).toBe(true)

    await app.setNewPassword('court')
    expect(app.getSnapshot()).toMatchObject({ passwordRecovery: true, authError: expect.stringMatching(/8 caractères/) })

    await app.setNewPassword('nouveau-mot-de-passe')
    expect(app.getSnapshot()).toMatchObject({ passwordRecovery: false, phase: 'ready' })

    await app.signOut()
    await app.signIn(SIGN_UP.email, SIGN_UP.password)
    expect(app.getSnapshot().authError).toBe('Email ou mot de passe incorrect.')
    await app.signIn(SIGN_UP.email, 'nouveau-mot-de-passe')
    expect(app.getSnapshot().phase).toBe('ready')
  })

  it('ne révèle pas si un email possède un compte', async () => {
    const accounts = new MemoryAccounts()
    const app = makeApp(accounts)
    await app.bootstrap()
    await app.sendPasswordReset('inconnu@example.com')
    expect(app.getSnapshot()).toMatchObject({ authError: undefined, authNotice: { kind: 'resetSent' } })
    expect(accounts.sentEmails).toEqual([])
  })
})

describe('suppression du compte', () => {
  it('efface le compte et le profil, et ramène à l\'écran de connexion', async () => {
    const accounts = new MemoryAccounts()
    const app = makeApp(accounts)
    await signUpAndOnboard(app)
    const id = app.getSnapshot().me!.id

    await app.deleteAccount()
    expect(app.getSnapshot().phase).toBe('signedOut')
    expect(app.getSnapshot().me).toBeUndefined()
    expect(await accounts.profiles.load(id)).toBeUndefined()

    await app.signIn(SIGN_UP.email, SIGN_UP.password)
    expect(app.getSnapshot().authError).toBe('Email ou mot de passe incorrect.')
  })
})

describe('enregistrement du profil', () => {
  it('un échec à la fin de l\'onboarding laisse l\'utilisateur sur l\'onboarding, avec un message', async () => {
    const accounts = new MemoryAccounts()
    const failing: ProfileRepository = {
      load: (id) => accounts.profiles.load(id),
      save: async () => {
        throw new Error('Profil non enregistré : hors connexion')
      },
    }
    const app = makeApp({ auth: accounts.auth, profiles: failing })
    await app.bootstrap()
    await app.signUp(SIGN_UP)
    await app.completeOnboarding(DETAILS)
    expect(app.getSnapshot()).toMatchObject({ phase: 'onboarding', errorMessage: 'Profil non enregistré : hors connexion' })
  })

  it('un échec d\'enregistrement pendant l\'usage est signalé sans bloquer l\'app', async () => {
    const accounts = new MemoryAccounts()
    let fail = false
    const flaky: ProfileRepository = {
      load: (id) => accounts.profiles.load(id),
      save: async (user) => {
        if (fail) throw new Error('réseau coupé')
        await accounts.profiles.save(user)
      },
    }
    const app = makeApp({ auth: accounts.auth, profiles: flaky })
    await signUpAndOnboard(app)
    fail = true
    app.updateProfile((user) => ({ ...user, bio: 'Nouvelle bio' }))
    await app.whenSaved()
    expect(app.getSnapshot()).toMatchObject({ phase: 'ready', me: { bio: 'Nouvelle bio' }, errorMessage: expect.stringContaining('réseau coupé') })
  })

  it('les modifications rapprochées sont enregistrées dans l\'ordre (la dernière l\'emporte)', async () => {
    const accounts = new MemoryAccounts()
    const app = makeApp(accounts)
    await signUpAndOnboard(app)
    app.updateProfile((user) => ({ ...user, bio: 'un' }))
    app.updateProfile((user) => ({ ...user, bio: 'deux' }))
    app.updateProfile((user) => ({ ...user, bio: 'trois' }))
    await app.whenSaved()
    expect((await accounts.profiles.load(app.getSnapshot().me!.id))?.bio).toBe('trois')
  })
})

describe('clé publique Supabase', () => {
  const jwt = (role: string) => `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ role }))}.signature`

  it('accepte les clés publiques (anon / publishable)', () => {
    expect(() => assertPublicKey(jwt('anon'))).not.toThrow()
    expect(() => assertPublicKey('sb_publishable_abc123')).not.toThrow()
  })

  it('refuse toute clé secrète : elle ne doit jamais atterrir dans une application web', () => {
    expect(() => assertPublicKey(jwt('service_role'))).toThrow(/SECRÈTE/)
    expect(() => assertPublicKey('sb_secret_abc123')).toThrow(/SECRÈTE/)
  })
})

describe('inscription en étapes (le compte n\'est créé qu\'à la fin)', () => {
  it('crée le compte ET enregistre le profil complet, puis ouvre directement l\'app', async () => {
    const accounts = new MemoryAccounts()
    const app = makeApp(accounts)
    await app.bootstrap()

    await app.signUp(SIGN_UP, DETAILS)

    const snap = app.getSnapshot()
    expect(snap).toMatchObject({ phase: 'ready', authBusy: false, accountEmail: 'lea@example.com' })
    expect(snap.me).toMatchObject({ firstName: 'Léa', age: 27, athleteStyle: 'adventurer', sports: SPORTS })
    expect(await accounts.profiles.load(snap.me!.id)).toMatchObject({ age: 27, athleteStyle: 'adventurer', sports: SPORTS })
  })

  it('ne passe jamais par l\'onboarding : le profil est enregistré avant l\'ouverture de la session', async () => {
    const accounts = new MemoryAccounts()
    const calls: string[] = []
    const recording: ProfileRepository = {
      load: (id) => (calls.push('load'), accounts.profiles.load(id)),
      save: (user) => (calls.push('save'), accounts.profiles.save(user)),
    }
    const app = makeApp({ auth: accounts.auth, profiles: recording })
    await app.bootstrap()
    const phases = new Set<string>()
    app.subscribe(() => phases.add(app.getSnapshot().phase))

    await app.signUp(SIGN_UP, DETAILS)

    expect(calls).toEqual(['save', 'load'])
    expect(phases.has('onboarding')).toBe(false)
    expect(app.getSnapshot().phase).toBe('ready')
  })

  it('email déjà inscrit : rien n\'est ouvert, on reste sur l\'inscription avec le message', async () => {
    const accounts = new MemoryAccounts()
    await signUpAndOnboard(makeApp(accounts))
    const other = makeApp(accounts)
    await other.bootstrap()
    await other.signOut()

    await other.signUp(SIGN_UP, { ...DETAILS, firstName: 'Intrus' })

    expect(other.getSnapshot()).toMatchObject({ phase: 'signedOut', authError: expect.stringMatching(/existe déjà/) })
    expect(other.getSnapshot().me).toBeUndefined()
  })

  it('profil non enregistré après la création : le compte existe, on retombe sur l\'onboarding avec un message', async () => {
    const accounts = new MemoryAccounts()
    const failing: ProfileRepository = {
      load: (id) => accounts.profiles.load(id),
      save: async () => {
        throw new Error('réseau coupé')
      },
    }
    const app = makeApp({ auth: accounts.auth, profiles: failing })
    await app.bootstrap()

    await app.signUp(SIGN_UP, DETAILS)

    expect(app.getSnapshot()).toMatchObject({
      phase: 'onboarding',
      errorMessage: expect.stringMatching(/profil n'a pas pu être enregistré/),
      me: { firstName: 'Léa', sports: [] },
    })
  })

  it('avec confirmation d\'email : pas de session, donc le profil sera à compléter à la première connexion', async () => {
    const accounts = new MemoryAccounts({ requireEmailConfirmation: true })
    const app = makeApp(accounts)
    await app.bootstrap()

    await app.signUp(SIGN_UP, DETAILS)
    expect(app.getSnapshot()).toMatchObject({ phase: 'signedOut', authNotice: { kind: 'confirmEmail' } })

    accounts.confirmEmail(SIGN_UP.email)
    await app.signIn(SIGN_UP.email, SIGN_UP.password)
    expect(app.getSnapshot()).toMatchObject({ phase: 'onboarding', me: { firstName: 'Léa', sports: [] } })
  })
})

describe('profil complet', () => {
  it('un compte sans âge ni style (ex. ancien profil) repasse par l\'onboarding, sports conservés', async () => {
    const accounts = new MemoryAccounts()
    const app = makeApp(accounts)
    await app.bootstrap()
    await app.signUp(SIGN_UP)
    await accounts.profiles.save({ ...app.getSnapshot().me!, sports: SPORTS }) // enregistré « à l'ancienne » : sports, mais ni âge ni style

    const reopened = makeApp(accounts)
    await reopened.bootstrap()

    expect(reopened.getSnapshot().phase).toBe('onboarding')
    const me = reopened.getSnapshot().me!
    expect(me.sports).toEqual(SPORTS)
    expect(me.age).toBeUndefined()
    expect(me.athleteStyle).toBeUndefined()
  })

  it('l\'âge et le style se modifient ensuite depuis le profil', async () => {
    const accounts = new MemoryAccounts()
    const app = makeApp(accounts)
    await signUpAndOnboard(app)
    app.updateProfile((user) => ({ ...user, age: 28, athleteStyle: 'competitor' }))
    await app.whenSaved()
    expect(await accounts.profiles.load(app.getSnapshot().me!.id)).toMatchObject({ age: 28, athleteStyle: 'competitor' })
  })
})

describe('connexion avec Google', () => {
  const google = () => new MemoryAccounts({ providers: ['google'] })

  it('sans fournisseur activé : aucun bouton, et l\'appel est refusé', async () => {
    const app = makeApp(new MemoryAccounts())
    await app.bootstrap()
    expect(app.getSnapshot().authProviders).toEqual([])

    await app.signInWithProvider('google')

    expect(app.getSnapshot()).toMatchObject({ phase: 'signedOut', authBusy: false, authError: expect.stringMatching(/pas activée/) })
  })

  it('nouveau compte : le prénom vient de Google, puis le profil est à compléter', async () => {
    const accounts = google()
    accounts.setProviderAccount('google', { email: 'Camille@Gmail.com', firstName: 'Camille' })
    const app = makeApp(accounts)
    await app.bootstrap()
    expect(app.getSnapshot().authProviders).toEqual(['google'])

    await app.signInWithProvider('google')
    let snap = app.getSnapshot()
    expect(snap).toMatchObject({ phase: 'onboarding', authBusy: false, accountEmail: 'camille@gmail.com' })
    expect(snap.me).toMatchObject({ firstName: 'Camille', sports: [] })

    await app.completeOnboarding({ ...DETAILS, firstName: 'Camille' })
    snap = app.getSnapshot()
    expect(snap.phase).toBe('ready')
    expect(await accounts.profiles.load(snap.me!.id)).toMatchObject({ firstName: 'Camille', age: 27, athleteStyle: 'adventurer', sports: SPORTS })
  })

  it('sans prénom donné par Google : repli sur le début de l\'email', async () => {
    const accounts = google()
    accounts.setProviderAccount('google', { email: 'marc.dupont@gmail.com' })
    const app = makeApp(accounts)
    await app.bootstrap()
    await app.signInWithProvider('google')
    expect(app.getSnapshot().me).toMatchObject({ firstName: 'marc.dupont' })
  })

  it('second passage : retrouve le même compte et son profil, sans repasser par l\'onboarding', async () => {
    const accounts = google()
    const app = makeApp(accounts)
    await app.bootstrap()
    await app.signInWithProvider('google')
    await app.completeOnboarding({ ...DETAILS, firstName: 'Camille' })
    const id = app.getSnapshot().me!.id

    await app.signOut()
    await app.signInWithProvider('google')

    expect(app.getSnapshot()).toMatchObject({ phase: 'ready', me: { id, firstName: 'Camille', sports: SPORTS } })
  })

  it('même email qu\'un compte avec mot de passe : c\'est le même compte, et le mot de passe marche toujours', async () => {
    const accounts = google()
    const app = makeApp(accounts)
    await signUpAndOnboard(app)
    const id = app.getSnapshot().me!.id
    await app.signOut()

    accounts.setProviderAccount('google', { email: 'LEA@example.com', firstName: 'Léa' })
    await app.signInWithProvider('google')
    expect(app.getSnapshot()).toMatchObject({ phase: 'ready', me: { id } })

    await app.signOut()
    await app.signIn(SIGN_UP.email, SIGN_UP.password)
    expect(app.getSnapshot()).toMatchObject({ phase: 'ready', me: { id } })
  })

  it('inscription par mot de passe jamais confirmée : la liaison supprime ce mot de passe (pas de prise de contrôle préalable)', async () => {
    const accounts = new MemoryAccounts({ requireEmailConfirmation: true, providers: ['google'] })
    const app = makeApp(accounts)
    await app.bootstrap()
    await app.signUp(SIGN_UP) // quelqu'un s'inscrit avec l'email d'autrui, sans jamais le confirmer
    expect(app.getSnapshot().authNotice).toMatchObject({ kind: 'confirmEmail' })

    accounts.setProviderAccount('google', { email: SIGN_UP.email, firstName: 'Léa' }) // la vraie personne se connecte avec Google
    await app.signInWithProvider('google')
    expect(app.getSnapshot().phase).toBe('onboarding')

    await app.signOut()
    await app.signIn(SIGN_UP.email, SIGN_UP.password) // le mot de passe posé d'avance ne marche plus
    expect(app.getSnapshot()).toMatchObject({ phase: 'signedOut', authError: 'Email ou mot de passe incorrect.' })
  })

  it('un compte créé avec Google peut supprimer son compte', async () => {
    const accounts = google()
    const app = makeApp(accounts)
    await app.bootstrap()
    await app.signInWithProvider('google')
    const id = app.getSnapshot().me!.id

    await app.deleteAccount()

    expect(app.getSnapshot().phase).toBe('signedOut')
    expect(await accounts.profiles.load(id)).toBeUndefined()
  })
})

describe('mode démo (sans compte)', () => {
  it('le profil local reçoit aussi l\'âge et le style de sportif choisis dans l\'assistant', async () => {
    const store = new MemoryProfileStore()
    const app = new AppState({ backend: new InMemoryBackend(), store })
    started.push(app)
    await app.bootstrap()
    expect(app.getSnapshot()).toMatchObject({ phase: 'onboarding', hasAccounts: false, authProviders: [] })

    await app.completeOnboarding(DETAILS)

    expect(app.getSnapshot()).toMatchObject({ phase: 'ready', me: { firstName: 'Léa', age: 27, athleteStyle: 'adventurer', sports: SPORTS } })
    expect(store.load()).toMatchObject({ firstName: 'Léa', age: 27, athleteStyle: 'adventurer' })
  })
})
