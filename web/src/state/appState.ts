import type { OAuthProvider } from '../auth/providers'
import type { Accounts, AuthEvent, AuthUser, SignUpInput } from '../auth/types'
import type { PresenceBackend } from '../core/backend'
import { DEMO_HUBS, populate, type DemoSimulator } from '../core/demo'
import { encode, type GeoCoordinate } from '../core/geohash'
import { InMemoryBackend } from '../core/memoryBackend'
import {
  DEFAULT_VISIBILITY,
  EMPTY_ALLIANCES,
  EMPTY_TRIBUS,
  primarySportID,
  type ActivitySession,
  type AllianceOverview,
  type EchoSuggestion,
  type MiniProfile,
  type PresencePin,
  type TribuOverview,
  type User,
  type VisibilitySettings,
} from '../core/models'
import { isProfileComplete, type ProfileDetails } from '../core/profileRules'
import { sportName } from '../core/sports'
import { uuid } from '../core/uuid'
import { LocationProvider, type LocationSnapshot } from './location'
import { LocalProfileStore, type ProfileStore } from './storage'

/**
 * - `loading`    : démarrage (restauration de la session).
 * - `signedOut`  : mode comptes, personne de connecté → écran de connexion / inscription.
 * - `onboarding` : compte créé mais profil incomplet (aucun sport choisi), ou mode démo sans profil.
 * - `ready`      : l'app.
 */
export type Phase = 'loading' | 'signedOut' | 'onboarding' | 'ready'

/** Message d'information à afficher sur l'écran d'authentification. */
export type AuthNotice =
  | { kind: 'confirmEmail'; email: string }
  | { kind: 'resetSent'; email: string }
  | { kind: 'passwordChanged' }

/** État immuable exposé aux composants (remplacé à chaque changement, pour `useSyncExternalStore`). */
export interface AppSnapshot {
  phase: Phase
  me?: User
  pins: PresencePin[]
  mySessions: ActivitySession[]
  history: ActivitySession[]
  alliances: AllianceOverview
  tribus: TribuOverview
  echoes: EchoSuggestion[]
  blockedUsers: User[]
  /** Filtre de la carte : undefined = tous les sports. */
  sportFilter?: string
  errorMessage?: string
  location: LocationSnapshot

  /** Vrai avec de vrais comptes (Supabase) ; faux en mode démo local. */
  hasAccounts: boolean
  /** Connexions « Continuer avec … » proposées (Google…). Vide : email + mot de passe seulement. */
  authProviders: readonly OAuthProvider[]
  accountEmail?: string
  /** Une opération d'authentification est en cours (boutons désactivés). */
  authBusy: boolean
  /** Erreur à afficher dans le formulaire d'authentification. */
  authError?: string
  authNotice?: AuthNotice
  /** Vrai quand l'app a été ouverte depuis un lien « mot de passe oublié » : il faut choisir un nouveau mot de passe. */
  passwordRecovery: boolean
}

/** Intervalle de mise à jour de position pendant une session (spec : 10-15 s, pas de flux continu). */
const POSITION_INTERVAL_MS = 12_000
const REFRESH_INTERVAL_MS = 4_000
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export interface AppStateOptions {
  backend?: PresenceBackend
  store?: ProfileStore
  location?: LocationProvider
  /** Comptes réels (Supabase). Sans cela, l'app tourne en mode démo local, sans compte. */
  accounts?: Accounts
}

/**
 * État applicatif partagé par tous les écrans. Tout passe par `PresenceBackend` :
 * remplacer `InMemoryBackend` par une implémentation Supabase/Firebase ne touche pas aux vues.
 *
 * Les comptes et profils sont déjà réels quand `accounts` est fourni ; la présence (pins, Alliances, Echos)
 * reste simulée par `PresenceBackend` tant que le temps réel n'est pas branché.
 */
export class AppState {
  readonly location: LocationProvider

  private readonly backend: PresenceBackend
  private readonly demoBackend?: InMemoryBackend
  private readonly store: ProfileStore
  private readonly accounts?: Accounts
  private simulator?: DemoSimulator
  private snap: AppSnapshot
  private listeners = new Set<() => void>()
  private bootstrapped = false
  private foreground = true
  private liveToken = 0
  private liveRunning = false
  private positionToken = 0
  private positionRunning = false
  private entering?: { userID: string; promise: Promise<void> }
  private saveChain: Promise<void> = Promise.resolve()
  /** Vrai pendant une inscription : la session ne s'ouvre qu'une fois le profil enregistré (voir `signUp`). */
  private creatingAccount = false

  /** Sans backend : backend en mémoire alimenté par des utilisateurs de démo répartis sur la France. */
  constructor(options: AppStateOptions = {}) {
    this.store = options.store ?? new LocalProfileStore()
    this.location = options.location ?? new LocationProvider()
    this.accounts = options.accounts
    if (options.backend) {
      this.backend = options.backend
    } else {
      const mock = new InMemoryBackend({ botReplyDelayMs: 4_000, welcomeRequestCount: 2 })
      this.backend = mock
      this.demoBackend = mock
    }
    this.snap = {
      phase: 'loading',
      pins: [],
      mySessions: [],
      history: [],
      alliances: EMPTY_ALLIANCES,
      tribus: EMPTY_TRIBUS,
      echoes: [],
      blockedUsers: [],
      location: this.location.snapshot(),
      hasAccounts: this.accounts !== undefined,
      authProviders: this.accounts?.providers ?? [],
      authBusy: false,
      passwordRecovery: false,
    }
    this.location.onChange = () => this.set({ location: this.location.snapshot() })
  }

  // MARK: Store (useSyncExternalStore)

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): AppSnapshot => this.snap

  private set(patch: Partial<AppSnapshot>): void {
    this.snap = { ...this.snap, ...patch }
    for (const listener of this.listeners) listener()
  }

  // MARK: Cycle de vie

  async bootstrap(): Promise<void> {
    if (this.bootstrapped) return
    this.bootstrapped = true
    if (this.demoBackend) this.simulator = await populate(this.demoBackend)

    if (this.accounts) {
      const auth = this.accounts.auth
      auth.onChange((event, user) => void this.handleAuthEvent(event, user))
      try {
        const restored = await auth.restore()
        if (restored.linkError) this.set({ authError: restored.linkError })
        if (restored.recovery) this.set({ passwordRecovery: true })
        if (restored.user) await this.enterSession(restored.user)
        else this.set({ phase: 'signedOut' })
      } catch (error) {
        this.set({ phase: 'signedOut', authError: messageOf(error) })
      }
      return
    }

    const saved = this.store.load()
    if (saved) {
      await this.backend.upsert(saved)
      this.set({ me: saved, phase: 'ready' })
      await this.refreshAll()
      this.updateLiveTasks()
    } else {
      this.set({ phase: 'onboarding' })
    }
  }

  setForeground(active: boolean): void {
    this.foreground = active
    this.updateLiveTasks()
    if (active && this.snap.phase === 'ready') void this.refreshAll()
  }

  /**
   * Fin de l'onboarding. Avec un compte déjà créé (connexion Google, inscription interrompue…), le profil est enregistré sur
   * le compte. En mode démo, c'est ici que le profil local est créé.
   */
  async completeOnboarding(details: ProfileDetails): Promise<void> {
    const { firstName, age, athleteStyle, sports } = details
    if (this.accounts) {
      const me = this.snap.me
      if (!me) return
      const user: User = { ...me, firstName: firstName.trim() || me.firstName, age, athleteStyle, sports }
      await this.run(async () => {
        await this.accounts!.profiles.save(user)
        await this.backend.upsert(user)
        this.set({ me: user, phase: 'ready' })
        await this.refreshAll()
        this.updateLiveTasks()
      })
      return
    }

    const user: User = {
      id: uuid(),
      firstName: firstName.trim(),
      bio: '',
      age,
      athleteStyle,
      sports,
      visibility: DEFAULT_VISIBILITY,
      joinedAt: Date.now(),
    }
    this.store.save(user)
    await this.backend.upsert(user)
    this.set({ me: user, phase: 'ready' })
    await this.refreshAll()
    this.updateLiveTasks()
  }

  /** Mode démo uniquement : efface le profil local et repasse par l'onboarding. */
  async deleteLocalProfile(): Promise<void> {
    for (const session of this.snap.mySessions) await this.backend.stopSession(session.id).catch(() => undefined)
    this.store.clear()
    this.set({
      me: undefined,
      pins: [],
      mySessions: [],
      history: [],
      echoes: [],
      blockedUsers: [],
      alliances: EMPTY_ALLIANCES,
      tribus: EMPTY_TRIBUS,
      phase: 'onboarding',
    })
    this.updateLiveTasks()
  }

  // MARK: Comptes

  /**
   * Crée le compte. Avec `details` (parcours d'inscription en étapes), le profil complet est enregistré juste après la
   * création et l'app s'ouvre directement ; sans, la personne passe par l'onboarding une fois connectée.
   */
  async signUp(input: SignUpInput, details?: ProfileDetails): Promise<void> {
    const accounts = this.accounts
    if (!accounts) return
    // Le SDK annonce la connexion dès la création du compte : on attend que le profil soit enregistré pour ouvrir l'app.
    this.creatingAccount = true
    try {
      await this.runAuth(async () => {
        const result = await accounts.auth.signUp(input)
        if (result.needsEmailConfirmation) {
          this.set({ authNotice: { kind: 'confirmEmail', email: input.email.trim() } })
          return
        }
        if (!result.user) return
        if (details) await this.saveNewProfile(accounts, result.user, details)
        await this.enterSession(result.user)
      })
    } finally {
      this.creatingAccount = false
    }
  }

  /** Enregistre le profil saisi pendant l'inscription. Si cela échoue, le compte existe déjà : l'onboarding permettra de le refaire. */
  private async saveNewProfile(accounts: Accounts, user: AuthUser, details: ProfileDetails): Promise<void> {
    const profile: User = {
      id: user.id,
      firstName: details.firstName.trim(),
      bio: '',
      age: details.age,
      athleteStyle: details.athleteStyle,
      sports: details.sports,
      visibility: DEFAULT_VISIBILITY,
      joinedAt: Date.now(),
    }
    try {
      await accounts.profiles.save(profile)
    } catch {
      this.set({ errorMessage: "Ton compte est créé, mais ton profil n'a pas pu être enregistré. Complète-le une nouvelle fois." })
    }
  }

  /** « Continuer avec Google » : avec Supabase la page part chez le fournisseur et la session arrive au retour (événement `signedIn`). */
  async signInWithProvider(provider: OAuthProvider): Promise<void> {
    const accounts = this.accounts
    if (!accounts) return
    await this.runAuth(async () => {
      const user = await accounts.auth.signInWithProvider(provider)
      if (user) await this.enterSession(user)
    })
  }

  async signIn(email: string, password: string): Promise<void> {
    const accounts = this.accounts
    if (!accounts) return
    await this.runAuth(async () => {
      await this.enterSession(await accounts.auth.signIn(email, password))
    })
  }

  async sendPasswordReset(email: string): Promise<void> {
    const accounts = this.accounts
    if (!accounts) return
    await this.runAuth(async () => {
      await accounts.auth.sendPasswordReset(email)
      this.set({ authNotice: { kind: 'resetSent', email: email.trim() } })
    })
  }

  /** Après un lien « mot de passe oublié » : enregistre le nouveau mot de passe et poursuit avec la session ouverte. */
  async setNewPassword(password: string): Promise<void> {
    const accounts = this.accounts
    if (!accounts) return
    await this.runAuth(async () => {
      await accounts.auth.updatePassword(password)
      this.set({ passwordRecovery: false, authNotice: { kind: 'passwordChanged' } })
      if (this.snap.phase !== 'ready' && this.snap.phase !== 'onboarding') {
        const { user } = await accounts.auth.restore()
        if (user) await this.enterSession(user)
      }
    })
  }

  async signOut(): Promise<void> {
    const accounts = this.accounts
    if (!accounts) return
    await this.saveChain // ne perd pas une modification de profil en cours d'enregistrement
    await this.run(async () => {
      await accounts.auth.signOut()
      await this.leaveSession()
    })
  }

  /** Supprime le compte ET toutes ses données côté serveur (irréversible). */
  async deleteAccount(): Promise<void> {
    const accounts = this.accounts
    if (!accounts) return
    await this.run(async () => {
      await accounts.auth.deleteAccount()
      await this.leaveSession()
    })
  }

  clearAuthMessages(): void {
    this.set({ authError: undefined, authNotice: undefined })
  }

  private async handleAuthEvent(event: AuthEvent, user?: AuthUser): Promise<void> {
    const inApp = this.snap.phase === 'ready' || this.snap.phase === 'onboarding'
    switch (event) {
      case 'passwordRecovery':
        this.set({ passwordRecovery: true })
        return
      case 'signedOut':
        if (inApp) await this.leaveSession()
        return
      case 'signedIn':
        // Pendant une inscription, `signUp` ouvre lui-même la session (une fois le profil enregistré).
        if (this.creatingAccount) return
        // Le SDK ré-émet parfois « connecté » (ex. retour sur l'onglet) : sans effet si c'est déjà la même personne.
        if (!user || (inApp && this.snap.me?.id === user.id)) return
        try {
          await this.enterSession(user)
        } catch (error) {
          this.set({ phase: 'signedOut', authError: messageOf(error) })
        }
    }
  }

  /** Ouvre l'app pour ce compte (idempotent : plusieurs appels simultanés pour le même compte n'en font qu'un). */
  private enterSession(user: AuthUser): Promise<void> {
    if (this.entering?.userID === user.id) return this.entering.promise
    const promise: Promise<void> = this.loadAccount(user).finally(() => {
      if (this.entering?.promise === promise) this.entering = undefined
    })
    this.entering = { userID: user.id, promise }
    return promise
  }

  private async loadAccount(user: AuthUser): Promise<void> {
    const accounts = this.accounts!
    const profile: User = (await accounts.profiles.load(user.id)) ?? {
      id: user.id,
      firstName: '',
      bio: '',
      sports: [],
      visibility: DEFAULT_VISIBILITY,
      joinedAt: Date.now(),
    }
    this.set({ me: profile, accountEmail: user.email, authError: undefined, authNotice: undefined })
    if (!isProfileComplete(profile)) {
      // Compte tout neuf (connexion Google, inscription interrompue…) : il reste à compléter le profil (prénom, âge, style, sports).
      this.set({ phase: 'onboarding' })
      return
    }
    await this.backend.upsert(profile)
    this.set({ phase: 'ready' })
    await this.refreshAll()
    this.updateLiveTasks()
  }

  /** Retour à l'écran de connexion : arrête les sessions en cours et efface tout ce qui est propre au compte. */
  private async leaveSession(): Promise<void> {
    if (!this.snap.me) return
    for (const session of this.snap.mySessions) await this.backend.stopSession(session.id).catch(() => undefined)
    this.set({
      me: undefined,
      accountEmail: undefined,
      pins: [],
      mySessions: [],
      history: [],
      echoes: [],
      blockedUsers: [],
      alliances: EMPTY_ALLIANCES,
      tribus: EMPTY_TRIBUS,
      sportFilter: undefined,
      phase: 'signedOut',
    })
    this.updateLiveTasks()
  }

  private async runAuth(action: () => Promise<void>): Promise<void> {
    this.set({ authBusy: true, authError: undefined })
    try {
      await action()
    } catch (error) {
      this.set({ authError: messageOf(error) })
    } finally {
      this.set({ authBusy: false })
    }
  }

  // MARK: Profil & visibilité

  updateProfile(change: (user: User) => User): void {
    const current = this.snap.me
    if (!current) return
    const user = change(current)
    this.set({ me: user })
    this.enqueueSave(user)
    void this.backend.upsert(user).then(() => this.refreshPins())
  }

  /** Attend que les modifications de profil en cours soient enregistrées. */
  whenSaved(): Promise<void> {
    return this.saveChain
  }

  /** Enregistrements dans l'ordre (sinon une sauvegarde lente pourrait en écraser une plus récente). */
  private enqueueSave(user: User): void {
    this.saveChain = this.saveChain.then(async () => {
      if (this.snap.me?.id !== user.id) return // déconnecté entre-temps
      try {
        if (this.accounts) await this.accounts.profiles.save(user)
        else this.store.save(user)
      } catch (error) {
        this.set({ errorMessage: `Ton profil n'a pas pu être enregistré. ${messageOf(error)}` })
      }
    })
  }

  setVisibility(patch: Partial<VisibilitySettings>): void {
    this.updateProfile((user) => ({ ...user, visibility: { ...user.visibility, ...patch } }))
  }

  setSportFilter(sportID?: string): void {
    this.set({ sportFilter: sportID })
  }

  setError(message?: string): void {
    this.set({ errorMessage: message })
  }

  // MARK: Sessions

  async startSession(sportID: string): Promise<void> {
    const me = this.snap.me
    if (!me) return
    // Demandé tout de suite (dans le geste de l'utilisateur) : le navigateur affiche son invite.
    if (this.location.authorization === 'unknown') void this.location.requestPermission()
    await this.run(async () => {
      await this.backend.startSession(me.id, sportID)
      await this.refreshSessions()
      this.updateLiveTasks()
      await this.refreshPins()
    })
  }

  async stopSession(id: string): Promise<void> {
    await this.run(async () => {
      await this.backend.stopSession(id)
      await this.refreshSessions()
      this.updateLiveTasks()
      await this.refreshPins()
      await this.refreshEchoes()
    })
  }

  /** Vrai si une session est active mais qu'aucune position n'a encore pu être envoyée. */
  get isAwaitingPosition(): boolean {
    return this.snap.mySessions.length > 0 && this.location.coordinate === undefined
  }

  /** Position ponctuelle pour recentrer la carte ("Me localiser"). */
  locateMe(): Promise<GeoCoordinate | undefined> {
    return this.location.currentPosition()
  }

  // MARK: Social

  async profile(userID: string): Promise<MiniProfile | undefined> {
    const me = this.snap.me
    return me ? this.backend.profile(userID, me.id) : undefined
  }

  async requestAlliance(userID: string): Promise<void> {
    const me = this.snap.me
    if (!me) return
    await this.run(async () => {
      await this.backend.requestAlliance(me.id, userID)
      await this.refreshSocial()
    })
  }

  async respondToAlliance(id: string, accept: boolean): Promise<void> {
    const me = this.snap.me
    if (!me) return
    await this.run(async () => {
      await this.backend.respondToAlliance(id, me.id, accept)
      await this.refreshSocial()
      await this.refreshPins()
    })
  }

  async createTribu(name: string): Promise<void> {
    const me = this.snap.me
    if (!me) return
    await this.run(async () => {
      await this.backend.createTribu(name, me.id)
      await this.refreshSocial()
    })
  }

  async joinTribu(id: string): Promise<void> {
    const me = this.snap.me
    if (!me) return
    await this.run(async () => {
      await this.backend.joinTribu(id, me.id)
      await this.refreshSocial()
    })
  }

  async leaveTribu(id: string): Promise<void> {
    const me = this.snap.me
    if (!me) return
    await this.run(async () => {
      await this.backend.leaveTribu(id, me.id)
      await this.refreshSocial()
    })
  }

  // MARK: Modération

  async block(userID: string): Promise<void> {
    const me = this.snap.me
    if (!me) return
    await this.run(async () => {
      await this.backend.block(userID, me.id)
      await this.refreshAll()
    })
  }

  async unblock(userID: string): Promise<void> {
    const me = this.snap.me
    if (!me) return
    await this.backend.unblock(userID, me.id)
    await this.refreshAll()
  }

  async report(userID: string, reason: string): Promise<void> {
    const me = this.snap.me
    if (!me) return
    await this.run(() => this.backend.report(userID, me.id, reason))
  }

  // MARK: Rafraîchissement

  async refreshAll(): Promise<void> {
    await this.refreshSessions()
    await this.refreshPins()
    await this.refreshSocial()
  }

  async refreshPins(): Promise<void> {
    const me = this.snap.me
    if (!me) return
    this.set({ pins: await this.backend.pins(me.id) })
  }

  async refreshSessions(): Promise<void> {
    const me = this.snap.me
    if (!me) return
    const [mySessions, history] = await Promise.all([this.backend.activeSessions(me.id), this.backend.history(me.id)])
    this.set({ mySessions, history })
  }

  async refreshEchoes(): Promise<void> {
    const me = this.snap.me
    if (!me) return
    this.set({ echoes: await this.backend.echoes(me.id) })
  }

  async refreshSocial(): Promise<void> {
    const me = this.snap.me
    if (!me) return
    const [alliances, tribus, blockedUsers] = await Promise.all([
      this.backend.allianceOverview(me.id),
      this.backend.tribus(me.id),
      this.backend.blockedUsers(me.id),
    ])
    this.set({ alliances, tribus, blockedUsers })
    await this.refreshEchoes()
  }

  // MARK: Boucles (uniquement au premier plan)

  private updateLiveTasks(): void {
    const shouldRefresh = this.snap.phase === 'ready' && this.foreground
    if (shouldRefresh) this.startLive()
    else this.stopLive()

    // La localisation ne tourne que si une session est active ; coupure automatique à la fin.
    if (shouldRefresh && this.snap.mySessions.length > 0) this.startPositionLoop()
    else this.stopPositionLoop()
  }

  private startLive(): void {
    if (this.liveRunning) return
    this.liveRunning = true
    const token = ++this.liveToken
    void (async () => {
      let iteration = 0
      while (this.liveToken === token) {
        await this.simulator?.tick()
        await this.refreshPins()
        await this.refreshSessions()
        if (iteration % 5 === 0) await this.refreshSocial()
        iteration += 1
        await sleep(REFRESH_INTERVAL_MS)
      }
    })()
  }

  private stopLive(): void {
    this.liveToken += 1
    this.liveRunning = false
  }

  private startPositionLoop(): void {
    if (this.positionRunning) return
    this.positionRunning = true
    const token = ++this.positionToken
    this.location.start()
    void (async () => {
      while (this.positionToken === token) {
        const sent = await this.pushPosition()
        // Tant qu'aucune position n'est disponible, on réessaie vite ; ensuite toutes les 12 s.
        await sleep(sent ? POSITION_INTERVAL_MS : 2_000)
      }
    })()
  }

  private stopPositionLoop(): void {
    if (!this.positionRunning) return
    this.positionToken += 1
    this.positionRunning = false
    this.location.stop()
  }

  private async pushPosition(): Promise<boolean> {
    if (!this.location.isAuthorized) return false
    this.location.start()
    const coordinate = this.location.coordinate
    if (!coordinate) return false
    for (const session of this.snap.mySessions) {
      await this.backend.updatePosition(session.id, coordinate.latitude, coordinate.longitude).catch(() => undefined)
    }
    await this.refreshPins()
    return true
  }

  private async run(action: () => Promise<void>): Promise<void> {
    try {
      await action()
    } catch (error) {
      this.set({ errorMessage: messageOf(error) })
    }
  }

  // MARK: Outils de démo

  get supportsDemoTools(): boolean {
    return this.demoBackend !== undefined
  }

  /** Ajoute 3 jours de pratique près d'un utilisateur de démo du même sport, pour voir apparaître des Echos. */
  async demoSimulateRecurringPractice(): Promise<void> {
    const me = this.snap.me
    const sportID = me && primarySportID(me)
    if (!me || !sportID || !this.demoBackend) return
    const spot = this.simulator?.spot(sportID)
    if (!spot) {
      this.set({ errorMessage: `Aucun utilisateur de démo ne pratique ${sportName(sportID)}.` })
      return
    }
    this.demoBackend.backfillHistory(me.id, sportID, encode(spot.latitude, spot.longitude), 3)
    await this.refreshAll()
  }

  /** Impose une position de démo (nom d'un lieu de `DEMO_HUBS`), ou revient à la géolocalisation réelle. */
  demoSetPosition(hubName?: string): void {
    const hub = DEMO_HUBS.find((h) => h.name === hubName)
    this.location.simulate(hub && { latitude: hub.latitude, longitude: hub.longitude })
    if (hub && this.positionRunning) void this.pushPosition()
  }
}
