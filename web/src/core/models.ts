import type { GeoCoordinate } from './geohash'

// MARK: - Utilisateur

export type VisibilityScope = 'everyone' | 'mySports' | 'myAlliances'

export const VISIBILITY_LABELS: Record<VisibilityScope, string> = {
  everyone: 'Tout le monde',
  mySports: 'Les pratiquants de mes sports',
  myAlliances: 'Mes Alliances uniquement',
}

export interface VisibilitySettings {
  scope: VisibilityScope
  /** Bascule "invisible", utilisable à tout moment, y compris en session active. */
  isInvisible: boolean
  /** Délai pendant lequel on reste visible ("récemment actif") après la fin d'une session. */
  lingerMinutes: number
}

export const LINGER_OPTIONS = [0, 5, 15, 30]
export const DEFAULT_VISIBILITY: VisibilitySettings = { scope: 'everyone', isInvisible: false, lingerMinutes: 15 }

export interface UserSport {
  sportID: string
  isPrimary: boolean
}

/** « Style de sportif » (badge du profil) : voir `ATHLETE_STYLES`. */
export type AthleteStyleID = 'adventurer' | 'competitor' | 'fun' | 'team' | 'wellbeing' | 'regular'

export interface User {
  id: string
  firstName: string
  bio: string
  /** Âge déclaré à l'inscription. Jamais montré aux autres. Absent tant que le profil n'est pas complet. */
  age?: number
  /** Badge « style de sportif ». Absent tant que le profil n'est pas complet. */
  athleteStyle?: AthleteStyleID
  /** Photo de profil (data URL JPEG). Locale au MVP ; deviendra une URL avec un vrai backend. */
  photoData?: string
  sports: UserSport[]
  visibility: VisibilitySettings
  /** Timestamp (ms). */
  joinedAt: number
}

export const userSportIDs = (user: User): string[] => user.sports.map((s) => s.sportID)
export const primarySportID = (user: User): string | undefined => (user.sports.find((s) => s.isPrimary) ?? user.sports[0])?.sportID
export const practices = (user: User, sportID: string): boolean => user.sports.some((s) => s.sportID === sportID)

// MARK: - Session de pratique

export type SessionStatus = 'active' | 'recentlyActive' | 'finished'

export interface ActivitySession {
  id: string
  userID: string
  sportID: string
  /** Position arrondie (geohash). Aucune coordonnée exacte n'est jamais stockée ni diffusée. */
  geohash?: string
  startedAt: number
  endedAt?: number
}

/** Actif pendant la session → "récemment actif" pendant `lingerMinutes` après l'arrêt → terminé. */
export function sessionStatus(session: ActivitySession, now: number, lingerMinutes: number): SessionStatus {
  if (session.endedAt === undefined) return 'active'
  return now - session.endedAt < lingerMinutes * 60_000 ? 'recentlyActive' : 'finished'
}

export const sessionDuration = (session: ActivitySession, now: number): number => (session.endedAt ?? now) - session.startedAt

// MARK: - Social

export type AllianceStatus = 'pending' | 'accepted'

export interface Alliance {
  id: string
  /** Demandeur. */
  userA: string
  /** Destinataire : seul lui peut accepter. */
  userB: string
  status: AllianceStatus
  /** Timestamp (ms) de l'acceptation ; absent tant que `status` est `pending`. Sert à dater l'événement dans l'actualité. */
  acceptedAt?: number
}

export const involves = (alliance: Alliance, userID: string): boolean => alliance.userA === userID || alliance.userB === userID
export const otherThan = (alliance: Alliance, userID: string): string => (alliance.userA === userID ? alliance.userB : alliance.userA)

export interface Tribu {
  id: string
  name: string
  creatorID: string
  memberIDs: string[]
  /** Timestamp (ms) de création. Sert à dater l'événement dans l'actualité. */
  createdAt: number
}

/**
 * Suivi asymétrique façon Instagram : je peux suivre quelqu'un sans qu'il me suive en retour, sans demande ni
 * acceptation — à la différence d'une Alliance (réciproque, qui exige une acceptation du destinataire). Les deux
 * coexistent : le suivi sert à garder un œil sur quelqu'un, l'Alliance à se connecter réellement.
 */
export interface Follow {
  followerID: string
  followingID: string
  createdAt: number
}

/** Suggestion générée automatiquement à partir de la pratique commune. Ne connecte personne d'elle-même. */
export interface Echo {
  id: string
  userA: string
  userB: string
  /** Calculé côté backend ; jamais exposé aux clients (voir `EchoSuggestion`). */
  proximityScore: number
  commonSportID: string
}

export interface Block {
  blocker: string
  blocked: string
}

export interface Report {
  id: string
  reporterID: string
  reportedID: string
  reason: string
  createdAt: number
}

/** Clé d'une paire non ordonnée d'utilisateurs. */
export const pairKey = (a: string, b: string): string => (a <= b ? `${a}|${b}` : `${b}|${a}`)

// MARK: - Vues côté client (ce que le backend diffuse)

/** Un pin par utilisateur visible. Ne porte que la position arrondie (centre de cellule geohash). */
export interface PresencePin {
  userID: string
  firstName: string
  sportIDs: string[]
  coordinate: GeoCoordinate
  status: 'active' | 'recentlyActive'
  isMe: boolean
  /** Faux pour mon propre pin quand je suis invisible aux autres. */
  isVisibleToOthers: boolean
}

/** Vrai si je suis déjà représenté par un pin (session active ou récente). Sert à éviter d'afficher en même temps
 * le pin de session (public, position arrondie) et le point « ma position » (local, jamais envoyé au serveur). */
export const hasMePin = (pins: readonly PresencePin[]): boolean => pins.some((pin) => pin.isMe)

export type AllianceRelation =
  | { kind: 'none' }
  | { kind: 'requestSent'; allianceID: string }
  | { kind: 'requestReceived'; allianceID: string }
  | { kind: 'allied' }

/** Mini-profil affiché au tap sur un pin : jamais de position. */
export interface MiniProfile {
  id: string
  firstName: string
  bio: string
  photoData?: string
  memberSince: number
  sportIDs: string[]
  currentSportIDs: string[]
  relation: AllianceRelation
  /** Vrai si le viewer suit déjà ce profil (indépendant de `relation`, qui ne concerne que les Alliances). */
  isFollowing: boolean
}

export interface AllianceEntry {
  alliance: Alliance
  other: User
}

export interface AllianceOverview {
  allies: AllianceEntry[]
  incoming: AllianceEntry[]
  outgoing: AllianceEntry[]
}

export const EMPTY_ALLIANCES: AllianceOverview = { allies: [], incoming: [], outgoing: [] }

export interface TribuOverview {
  mine: Tribu[]
  discover: Tribu[]
}

export const EMPTY_TRIBUS: TribuOverview = { mine: [], discover: [] }

export interface EchoSuggestion {
  id: string
  user: User
  sportID: string
}

export interface FollowOverview {
  following: User[]
  followers: User[]
}

export const EMPTY_FOLLOW: FollowOverview = { following: [], followers: [] }

/** Une personne à suivre (recherche ou suggestion), avec le sport commun qui justifie la suggestion (absent en recherche). */
export interface PersonSuggestion {
  user: User
  sharedSportID?: string
}

// MARK: - Actualité

export type FeedItem =
  | { id: string; kind: 'record'; at: number; userID: string; firstName: string; sportID: string; recordType: 'longestSession'; durationMs: number }
  | { id: string; kind: 'record'; at: number; userID: string; firstName: string; sportID: string; recordType: 'milestone'; sessionCount: number }
  | { id: string; kind: 'newSession'; at: number; userID: string; firstName: string; sportID: string }
  | { id: string; kind: 'allianceFormed'; at: number; userAID: string; userAName: string; userBID: string; userBName: string }
  | { id: string; kind: 'tribuCreated'; at: number; tribuID: string; tribuName: string; creatorID: string; creatorName: string }

// MARK: - Sélection de sports

/** Ajoute ou retire un sport. Garde toujours exactement un sport "principal" tant que la liste n'est pas vide. */
export function toggleSport(sports: UserSport[], sportID: string): UserSport[] {
  const index = sports.findIndex((s) => s.sportID === sportID)
  if (index < 0) return [...sports, { sportID, isPrimary: sports.length === 0 }]
  const next = sports.filter((_, i) => i !== index)
  if (sports[index]!.isPrimary && next.length > 0) next[0] = { ...next[0]!, isPrimary: true }
  return next
}

export function makePrimary(sports: UserSport[], sportID: string): UserSport[] {
  if (!sports.some((s) => s.sportID === sportID)) return sports
  return sports.map((s) => ({ ...s, isPrimary: s.sportID === sportID }))
}
