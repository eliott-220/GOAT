import { BackendError, type PresenceBackend } from './backend'
import { decode, encode } from './geohash'
import {
  involves,
  otherThan,
  pairKey,
  practices,
  sessionDuration,
  sessionStatus,
  userSportIDs,
  type ActivitySession,
  type Alliance,
  type AllianceOverview,
  type AllianceRelation,
  type Block,
  type EchoSuggestion,
  type FeedItem,
  type Follow,
  type FollowOverview,
  type MiniProfile,
  type PersonSuggestion,
  type PresencePin,
  type Report,
  type Tribu,
  type TribuOverview,
  type User,
} from './models'
import { canSee, canSuggest, generateEchoes, SocialGraph, type EchoOptions } from './rules'
import { normalizeForSearch, sportById } from './sports'
import { uuid } from './uuid'

/** Étapes (nombre total de sessions terminées) qui déclenchent un évènement "record" dans l'actualité. */
const SESSION_MILESTONES = [10, 25, 50, 100, 200]

export interface InMemoryBackendOptions {
  now?: () => number
  echoOptions?: Partial<EchoOptions>
  /** Si défini, les utilisateurs de démo acceptent les demandes d'Alliance après ce délai (ms). */
  botReplyDelayMs?: number
  /** Nombre de demandes d'Alliance de démo reçues par un nouvel utilisateur. */
  welcomeRequestCount?: number
}

/**
 * Backend en mémoire : applique toutes les règles métier de la spec, sans réseau.
 * Sert au développement, aux tests et à la démo tant que le vrai backend n'est pas branché.
 */
export class InMemoryBackend implements PresenceBackend {
  private users = new Map<string, User>()
  private sessions = new Map<string, ActivitySession>()
  private alliances = new Map<string, Alliance>()
  private tribusById = new Map<string, Tribu>()
  private follows: Follow[] = []
  private blocks: Block[] = []
  private reports: Report[] = []
  private botIDs = new Set<string>()

  private readonly now: () => number
  private readonly echoOptions: Partial<EchoOptions>
  private readonly botReplyDelayMs?: number
  private readonly welcomeRequestCount: number

  constructor(options: InMemoryBackendOptions = {}) {
    this.now = options.now ?? (() => Date.now())
    this.echoOptions = options.echoOptions ?? {}
    this.botReplyDelayMs = options.botReplyDelayMs
    this.welcomeRequestCount = options.welcomeRequestCount ?? 0
  }

  // MARK: Seed (démo / tests)

  seed(bots: User[], seededSessions: ActivitySession[]): void {
    for (const bot of bots) {
      this.users.set(bot.id, bot)
      this.botIDs.add(bot.id)
    }
    for (const session of seededSessions) this.sessions.set(session.id, session)
  }

  /** Ajoute `days` sessions passées (jours distincts) au même endroit, pour que les Echos puissent apparaître. */
  backfillHistory(userID: string, sportID: string, geohash: string, days: number): void {
    const base = this.now()
    for (let day = 1; day <= Math.max(1, days); day++) {
      const startedAt = base - day * 86_400_000 - 3_600_000
      const session: ActivitySession = { id: uuid(), userID, sportID, geohash, startedAt, endedAt: startedAt + 3_600_000 }
      this.sessions.set(session.id, session)
    }
  }

  get reportCount(): number {
    return this.reports.length
  }

  // MARK: Utilisateurs

  async upsert(user: User): Promise<void> {
    const isNew = !this.users.has(user.id)
    this.users.set(user.id, user)
    if (isNew && this.botReplyDelayMs !== undefined && this.welcomeRequestCount > 0) {
      const botIDs = [...this.botIDs].sort().slice(0, this.welcomeRequestCount)
      for (const botID of botIDs) {
        const alliance: Alliance = { id: uuid(), userA: botID, userB: user.id, status: 'pending' }
        this.alliances.set(alliance.id, alliance)
      }
    }
  }

  async user(id: string): Promise<User | undefined> {
    return this.users.get(id)
  }

  async profile(targetID: string, viewerID: string): Promise<MiniProfile | undefined> {
    const target = this.users.get(targetID)
    const graph = this.graph()
    if (!target || graph.isBlocked(viewerID, targetID)) return undefined

    const now = this.now()
    const current = [...this.sessions.values()]
      .filter((s) => s.userID === targetID && sessionStatus(s, now, target.visibility.lingerMinutes) === 'active')
      .map((s) => s.sportID)

    let relation: AllianceRelation = { kind: 'none' }
    const alliance = graph.allianceBetween(viewerID, targetID)
    if (alliance) {
      if (alliance.status === 'accepted') relation = { kind: 'allied' }
      else if (alliance.userA === viewerID) relation = { kind: 'requestSent', allianceID: alliance.id }
      else relation = { kind: 'requestReceived', allianceID: alliance.id }
    }

    return {
      id: target.id,
      firstName: target.firstName,
      bio: target.bio,
      photoData: target.photoData,
      memberSince: target.joinedAt,
      sportIDs: userSportIDs(target),
      currentSportIDs: current,
      relation,
      isFollowing: this.follows.some((f) => f.followerID === viewerID && f.followingID === targetID),
    }
  }

  // MARK: Sessions

  async startSession(userID: string, sportID: string): Promise<ActivitySession> {
    const user = this.users.get(userID)
    if (!user) throw new BackendError('userNotFound')
    if (!sportById(sportID)) throw new BackendError('invalid', 'Sport inconnu.')
    if (!practices(user, sportID)) throw new BackendError('invalid', "Ce sport n'est pas dans ton profil.")
    const existing = [...this.sessions.values()].find((s) => s.userID === userID && s.sportID === sportID && s.endedAt === undefined)
    if (existing) return existing
    const session: ActivitySession = { id: uuid(), userID, sportID, startedAt: this.now() }
    this.sessions.set(session.id, session)
    return session
  }

  /** Arrondi côté serveur : la coordonnée brute n'est jamais conservée. */
  async updatePosition(sessionID: string, latitude: number, longitude: number): Promise<void> {
    const session = this.sessions.get(sessionID)
    if (!session) throw new BackendError('sessionNotFound')
    if (session.endedAt !== undefined) throw new BackendError('notAllowed')
    this.sessions.set(sessionID, { ...session, geohash: encode(latitude, longitude) })
  }

  async stopSession(sessionID: string): Promise<void> {
    const session = this.sessions.get(sessionID)
    if (!session) throw new BackendError('sessionNotFound')
    if (session.endedAt === undefined) this.sessions.set(sessionID, { ...session, endedAt: this.now() })
  }

  async activeSessions(userID: string): Promise<ActivitySession[]> {
    return [...this.sessions.values()].filter((s) => s.userID === userID && s.endedAt === undefined).sort((a, b) => a.startedAt - b.startedAt)
  }

  async history(userID: string): Promise<ActivitySession[]> {
    return [...this.sessions.values()].filter((s) => s.userID === userID && s.endedAt !== undefined).sort((a, b) => b.startedAt - a.startedAt)
  }

  async pins(viewerID: string): Promise<PresencePin[]> {
    const viewer = this.users.get(viewerID)
    if (!viewer) return []
    const graph = this.graph()
    const now = this.now()

    const visible = new Map<string, ActivitySession[]>()
    for (const session of this.sessions.values()) {
      const target = this.users.get(session.userID)
      if (!target || !canSee(viewer, target, session, graph, now)) continue
      const list = visible.get(target.id) ?? []
      list.push(session)
      visible.set(target.id, list)
    }

    const pins: PresencePin[] = []
    for (const [userID, userSessions] of visible) {
      const user = this.users.get(userID)
      if (!user) continue
      const byRecency = [...userSessions].sort((a, b) => b.startedAt - a.startedAt)
      const coordinate = byRecency[0]!.geohash ? decode(byRecency[0]!.geohash) : undefined
      if (!coordinate) continue
      const linger = user.visibility.lingerMinutes
      const isActive = byRecency.some((s) => sessionStatus(s, now, linger) === 'active')
      pins.push({
        userID,
        firstName: user.firstName,
        // Un sport n'apparaît qu'une fois (session récente + nouvelle session du même sport), du plus récent au plus ancien.
        sportIDs: [...new Set(byRecency.map((s) => s.sportID))],
        coordinate,
        status: isActive ? 'active' : 'recentlyActive',
        isMe: userID === viewerID,
        isVisibleToOthers: !user.visibility.isInvisible,
      })
    }
    return pins.sort((a, b) => (a.userID < b.userID ? -1 : 1))
  }

  // MARK: Alliances & tribus

  async allianceOverview(userID: string): Promise<AllianceOverview> {
    const graph = this.graph()
    const overview: AllianceOverview = { allies: [], incoming: [], outgoing: [] }
    for (const alliance of this.alliances.values()) {
      if (!involves(alliance, userID)) continue
      const otherID = otherThan(alliance, userID)
      const other = this.users.get(otherID)
      if (!other || graph.isBlocked(userID, otherID)) continue
      const entry = { alliance, other }
      if (alliance.status === 'accepted') overview.allies.push(entry)
      else if (alliance.userA === userID) overview.outgoing.push(entry)
      else overview.incoming.push(entry)
    }
    const byName = (a: { other: User }, b: { other: User }) => a.other.firstName.localeCompare(b.other.firstName, 'fr')
    overview.allies.sort(byName)
    overview.incoming.sort(byName)
    overview.outgoing.sort(byName)
    return overview
  }

  async requestAlliance(requesterID: string, targetID: string): Promise<Alliance> {
    if (requesterID === targetID) throw new BackendError('invalid', "Tu ne peux pas t'ajouter toi-même.")
    if (!this.users.has(requesterID) || !this.users.has(targetID)) throw new BackendError('userNotFound')
    const graph = this.graph()
    if (graph.isBlocked(requesterID, targetID)) throw new BackendError('notAllowed')
    if (graph.allianceBetween(requesterID, targetID)) throw new BackendError('alreadyExists')

    const alliance: Alliance = { id: uuid(), userA: requesterID, userB: targetID, status: 'pending' }
    this.alliances.set(alliance.id, alliance)

    if (this.botReplyDelayMs !== undefined && this.botIDs.has(targetID)) {
      setTimeout(() => this.botAccepts(alliance.id), this.botReplyDelayMs)
    }
    return alliance
  }

  private botAccepts(allianceID: string): void {
    const alliance = this.alliances.get(allianceID)
    if (alliance?.status === 'pending') this.alliances.set(allianceID, { ...alliance, status: 'accepted', acceptedAt: this.now() })
  }

  async respondToAlliance(id: string, userID: string, accept: boolean): Promise<void> {
    const alliance = this.alliances.get(id)
    if (!alliance) throw new BackendError('allianceNotFound')
    // Jamais unilatérale : seul le destinataire d'une demande en attente peut répondre.
    if (alliance.userB !== userID || alliance.status !== 'pending') throw new BackendError('notAllowed')
    if (accept) this.alliances.set(id, { ...alliance, status: 'accepted', acceptedAt: this.now() })
    else this.alliances.delete(id)
  }

  async tribus(userID: string): Promise<TribuOverview> {
    const all = [...this.tribusById.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    return { mine: all.filter((t) => t.memberIDs.includes(userID)), discover: all.filter((t) => !t.memberIDs.includes(userID)) }
  }

  async createTribu(name: string, creatorID: string): Promise<Tribu> {
    const trimmed = name.trim()
    if (!trimmed) throw new BackendError('invalid', 'Donne un nom à ta tribu.')
    if (!this.users.has(creatorID)) throw new BackendError('userNotFound')
    const tribu: Tribu = { id: uuid(), name: trimmed, creatorID, memberIDs: [creatorID], createdAt: this.now() }
    this.tribusById.set(tribu.id, tribu)
    return tribu
  }

  async joinTribu(id: string, userID: string): Promise<void> {
    const tribu = this.tribusById.get(id)
    if (!tribu) throw new BackendError('tribuNotFound')
    if (!this.users.has(userID)) throw new BackendError('userNotFound')
    if (!tribu.memberIDs.includes(userID)) this.tribusById.set(id, { ...tribu, memberIDs: [...tribu.memberIDs, userID] })
  }

  async leaveTribu(id: string, userID: string): Promise<void> {
    const tribu = this.tribusById.get(id)
    if (!tribu) throw new BackendError('tribuNotFound')
    const memberIDs = tribu.memberIDs.filter((m) => m !== userID)
    if (memberIDs.length === 0) this.tribusById.delete(id)
    else this.tribusById.set(id, { ...tribu, memberIDs })
  }

  // MARK: Echos

  async echoes(userID: string): Promise<EchoSuggestion[]> {
    const viewer = this.users.get(userID)
    if (!viewer) return []
    const graph = this.graph()
    // Pas d'Echo pour une paire déjà liée (demande en cours ou Alliance) ou bloquée.
    const excluded = new Set<string>([
      ...[...this.alliances.values()].map((a) => pairKey(a.userA, a.userB)),
      ...this.blocks.map((b) => pairKey(b.blocker, b.blocked)),
    ])

    const suggestions: EchoSuggestion[] = []
    for (const echo of generateEchoes([...this.sessions.values()], excluded, this.now(), this.echoOptions)) {
      if (echo.userA !== userID && echo.userB !== userID) continue
      const other = this.users.get(echo.userA === userID ? echo.userB : echo.userA)
      if (!other || !canSuggest(other, viewer, graph)) continue
      suggestions.push({ id: echo.id, user: other, sportID: echo.commonSportID })
    }
    return suggestions
  }

  // MARK: Suivi

  async follow(followerID: string, targetID: string): Promise<void> {
    if (followerID === targetID) throw new BackendError('invalid', 'Tu ne peux pas te suivre toi-même.')
    if (!this.users.has(followerID) || !this.users.has(targetID)) throw new BackendError('userNotFound')
    if (this.graph().isBlocked(followerID, targetID)) throw new BackendError('notAllowed')
    if (this.follows.some((f) => f.followerID === followerID && f.followingID === targetID)) return
    this.follows.push({ followerID, followingID: targetID, createdAt: this.now() })
  }

  async unfollow(followerID: string, targetID: string): Promise<void> {
    this.follows = this.follows.filter((f) => !(f.followerID === followerID && f.followingID === targetID))
  }

  async followOverview(userID: string): Promise<FollowOverview> {
    const graph = this.graph()
    const byName = (a: User, b: User) => a.firstName.localeCompare(b.firstName, 'fr')
    const resolve = (ids: string[]) =>
      ids
        .map((id) => this.users.get(id))
        .filter((u): u is User => u !== undefined && !graph.isBlocked(userID, u.id))
        .sort(byName)
    return {
      following: resolve(this.follows.filter((f) => f.followerID === userID).map((f) => f.followingID)),
      followers: resolve(this.follows.filter((f) => f.followingID === userID).map((f) => f.followerID)),
    }
  }

  async suggestedPeople(viewerID: string, limit = 12): Promise<PersonSuggestion[]> {
    const viewer = this.users.get(viewerID)
    if (!viewer) return []
    const graph = this.graph()
    const alreadyFollowing = new Set(this.follows.filter((f) => f.followerID === viewerID).map((f) => f.followingID))
    const viewerSports = new Set(userSportIDs(viewer))

    const scored = [...this.users.values()]
      .filter((u) => u.id !== viewerID && !alreadyFollowing.has(u.id) && !u.visibility.isInvisible && canSuggest(u, viewer, graph))
      .map((user) => ({ user, sharedSportID: userSportIDs(user).find((id) => viewerSports.has(id)) }))
    // Un sport en commun d'abord (comme un Echo), puis ordre alphabétique : stable et prévisible plutôt qu'aléatoire.
    scored.sort((a, b) => Number(b.sharedSportID !== undefined) - Number(a.sharedSportID !== undefined) || a.user.firstName.localeCompare(b.user.firstName, 'fr'))
    return scored.slice(0, limit)
  }

  async searchPeople(viewerID: string, query: string): Promise<User[]> {
    const viewer = this.users.get(viewerID)
    const needle = normalizeForSearch(query.trim())
    if (!viewer || !needle) return []
    const graph = this.graph()
    return [...this.users.values()]
      .filter((u) => u.id !== viewerID && canSuggest(u, viewer, graph) && normalizeForSearch(u.firstName).includes(needle))
      .sort((a, b) => a.firstName.localeCompare(b.firstName, 'fr'))
      .slice(0, 30)
  }

  // MARK: Actualité

  /**
   * Évènements dérivés des données existantes, jamais stockés à part : records personnels (une session qui bat
   * toutes les précédentes du même sport, ou une étape franchie), sessions en cours, Alliances formées, tribus
   * créées. Respecte les mêmes règles de visibilité qu'un Echo (pas de "myAlliances" pour un inconnu, jamais
   * quelqu'un de bloqué), plus mes propres évènements.
   */
  async feed(viewerID: string, limit = 30): Promise<FeedItem[]> {
    const viewer = this.users.get(viewerID)
    if (!viewer) return []
    const graph = this.graph()
    const visible = (targetID: string): boolean => {
      if (targetID === viewerID) return true
      const target = this.users.get(targetID)
      return target !== undefined && !target.visibility.isInvisible && canSuggest(target, viewer, graph)
    }

    const items: FeedItem[] = []

    // Records : sessions terminées groupées par (utilisateur, sport), triées par date de début ; "record" seulement
    // si elle bat au moins une tentative précédente (sinon la toute première session serait un "record" trivial).
    const bySportUser = new Map<string, ActivitySession[]>()
    for (const session of this.sessions.values()) {
      if (session.endedAt === undefined || !visible(session.userID)) continue
      const key = `${session.userID}|${session.sportID}`
      const list = bySportUser.get(key) ?? []
      list.push(session)
      bySportUser.set(key, list)
    }
    for (const list of bySportUser.values()) {
      const user = this.users.get(list[0]!.userID)
      if (!user) continue
      let best = 0
      for (const [index, session] of [...list].sort((a, b) => a.startedAt - b.startedAt).entries()) {
        const duration = sessionDuration(session, session.endedAt!)
        if (index > 0 && duration > best) {
          items.push({
            id: `record:${session.id}`,
            kind: 'record',
            at: session.endedAt!,
            userID: user.id,
            firstName: user.firstName,
            sportID: session.sportID,
            recordType: 'longestSession',
            durationMs: duration,
          })
        }
        best = Math.max(best, duration)
      }
    }

    // Étapes : Nème session terminée (tous sports confondus).
    const byUser = new Map<string, ActivitySession[]>()
    for (const session of this.sessions.values()) {
      if (session.endedAt === undefined || !visible(session.userID)) continue
      const list = byUser.get(session.userID) ?? []
      list.push(session)
      byUser.set(session.userID, list)
    }
    for (const list of byUser.values()) {
      const user = this.users.get(list[0]!.userID)
      if (!user) continue
      for (const [index, session] of [...list].sort((a, b) => a.startedAt - b.startedAt).entries()) {
        const count = index + 1
        if (!SESSION_MILESTONES.includes(count)) continue
        items.push({
          id: `milestone:${session.id}`,
          kind: 'record',
          at: session.endedAt!,
          userID: user.id,
          firstName: user.firstName,
          sportID: session.sportID,
          recordType: 'milestone',
          sessionCount: count,
        })
      }
    }

    // Sessions en cours seulement (pas tout l'historique, qui noierait le reste sous des débuts de session anciens).
    // Plafonnées à un tiers du fil : sans ça, une rafale de départs simultanés (comme au lancement de la démo)
    // noierait aussi les records et évènements communautaires, plus rares mais plus intéressants.
    const newSessions: FeedItem[] = []
    for (const session of this.sessions.values()) {
      if (session.endedAt !== undefined || session.userID === viewerID || !visible(session.userID)) continue
      const user = this.users.get(session.userID)
      if (!user) continue
      newSessions.push({ id: `session:${session.id}`, kind: 'newSession', at: session.startedAt, userID: user.id, firstName: user.firstName, sportID: session.sportID })
    }
    newSessions.sort((a, b) => b.at - a.at)
    items.push(...newSessions.slice(0, Math.max(3, Math.ceil(limit / 3))))

    // Alliances formées (acceptées des deux côtés).
    for (const alliance of this.alliances.values()) {
      if (alliance.status !== 'accepted' || alliance.acceptedAt === undefined) continue
      if (!visible(alliance.userA) && !visible(alliance.userB)) continue
      const userA = this.users.get(alliance.userA)
      const userB = this.users.get(alliance.userB)
      if (!userA || !userB) continue
      items.push({
        id: `alliance:${alliance.id}`,
        kind: 'allianceFormed',
        at: alliance.acceptedAt,
        userAID: userA.id,
        userAName: userA.firstName,
        userBID: userB.id,
        userBName: userB.firstName,
      })
    }

    // Tribus créées.
    for (const tribu of this.tribusById.values()) {
      if (!visible(tribu.creatorID)) continue
      const creator = this.users.get(tribu.creatorID)
      if (!creator) continue
      items.push({ id: `tribu:${tribu.id}`, kind: 'tribuCreated', at: tribu.createdAt, tribuID: tribu.id, tribuName: tribu.name, creatorID: creator.id, creatorName: creator.firstName })
    }

    items.sort((a, b) => b.at - a.at)
    return items.slice(0, limit)
  }

  // MARK: Modération

  async block(blockedID: string, blockerID: string): Promise<void> {
    if (blockerID === blockedID) throw new BackendError('invalid', 'Tu ne peux pas te bloquer toi-même.')
    if (!this.users.has(blockedID)) throw new BackendError('userNotFound')
    if (!this.blocks.some((b) => b.blocker === blockerID && b.blocked === blockedID)) this.blocks.push({ blocker: blockerID, blocked: blockedID })
    // Un blocage rompt aussi toute Alliance ou demande en cours, et le suivi dans les deux sens.
    for (const [id, alliance] of this.alliances) {
      if (involves(alliance, blockerID) && involves(alliance, blockedID)) this.alliances.delete(id)
    }
    this.follows = this.follows.filter(
      (f) => !(f.followerID === blockerID && f.followingID === blockedID) && !(f.followerID === blockedID && f.followingID === blockerID),
    )
  }

  async unblock(blockedID: string, blockerID: string): Promise<void> {
    this.blocks = this.blocks.filter((b) => !(b.blocker === blockerID && b.blocked === blockedID))
  }

  async blockedUsers(userID: string): Promise<User[]> {
    return this.blocks
      .filter((b) => b.blocker === userID)
      .map((b) => this.users.get(b.blocked))
      .filter((u): u is User => u !== undefined)
      .sort((a, b) => a.firstName.localeCompare(b.firstName, 'fr'))
  }

  async report(reportedID: string, reporterID: string, reason: string): Promise<void> {
    if (!this.users.has(reportedID)) throw new BackendError('userNotFound')
    this.reports.push({ id: uuid(), reporterID, reportedID, reason, createdAt: this.now() })
  }

  private graph(): SocialGraph {
    return new SocialGraph([...this.alliances.values()], this.blocks)
  }
}
