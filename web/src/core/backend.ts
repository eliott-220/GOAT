import type {
  ActivitySession,
  Alliance,
  AllianceOverview,
  EchoSuggestion,
  FeedItem,
  FollowOverview,
  MiniProfile,
  PersonSuggestion,
  PresencePin,
  Tribu,
  TribuOverview,
  User,
} from './models'

export type BackendErrorCode =
  | 'userNotFound'
  | 'sessionNotFound'
  | 'allianceNotFound'
  | 'tribuNotFound'
  | 'notAllowed'
  | 'alreadyExists'
  | 'invalid'

const DEFAULT_MESSAGES: Record<BackendErrorCode, string> = {
  userNotFound: 'Utilisateur introuvable.',
  sessionNotFound: 'Session introuvable.',
  allianceNotFound: "Demande d'Alliance introuvable.",
  tribuNotFound: 'Tribu introuvable.',
  notAllowed: 'Action non autorisée.',
  alreadyExists: 'Cette demande existe déjà.',
  invalid: 'Requête invalide.',
}

export class BackendError extends Error {
  constructor(
    readonly code: BackendErrorCode,
    message?: string,
  ) {
    super(message ?? DEFAULT_MESSAGES[code])
    this.name = 'BackendError'
  }
}

/**
 * Contrat entre l'app et le backend temps réel (Supabase Realtime ou Firebase, à trancher).
 * Même contrat que la version Swift (`PresenceBackend`).
 *
 * Règles que toute implémentation doit garantir :
 * - la position reçue par `updatePosition` est arrondie **côté serveur** ; seul le geohash est stocké/diffusé ;
 * - `pins`, `profile` et `echoes` n'exposent rien d'un utilisateur bloqué (dans les deux sens) ;
 * - une Alliance exige demande + acceptation par le destinataire.
 */
export interface PresenceBackend {
  // Utilisateurs
  upsert(user: User): Promise<void>
  user(id: string): Promise<User | undefined>
  profile(targetID: string, viewerID: string): Promise<MiniProfile | undefined>

  // Sessions
  /** Plusieurs sessions simultanées sont possibles, mais une seule par sport. */
  startSession(userID: string, sportID: string): Promise<ActivitySession>
  updatePosition(sessionID: string, latitude: number, longitude: number): Promise<void>
  stopSession(sessionID: string): Promise<void>
  activeSessions(userID: string): Promise<ActivitySession[]>
  history(userID: string): Promise<ActivitySession[]>
  pins(viewerID: string): Promise<PresencePin[]>

  // Alliances & tribus
  allianceOverview(userID: string): Promise<AllianceOverview>
  requestAlliance(requesterID: string, targetID: string): Promise<Alliance>
  respondToAlliance(id: string, userID: string, accept: boolean): Promise<void>
  tribus(userID: string): Promise<TribuOverview>
  createTribu(name: string, creatorID: string): Promise<Tribu>
  joinTribu(id: string, userID: string): Promise<void>
  leaveTribu(id: string, userID: string): Promise<void>

  // Echos (lecture seule : ils sont générés automatiquement)
  echoes(userID: string): Promise<EchoSuggestion[]>

  // Suivi (asymétrique, façon Instagram : jamais de demande ni d'acceptation, voir Follow)
  follow(followerID: string, targetID: string): Promise<void>
  unfollow(followerID: string, targetID: string): Promise<void>
  followOverview(userID: string): Promise<FollowOverview>
  /** Personnes à découvrir : pas déjà suivies, ni bloquées, ni soi-même. `sharedSportID` si connu (raison affichée). */
  suggestedPeople(viewerID: string, limit?: number): Promise<PersonSuggestion[]>
  searchPeople(viewerID: string, query: string): Promise<User[]>

  // Actualité : évènements dérivés (records, nouvelles sessions, Alliances, tribus), les plus récents en premier.
  feed(viewerID: string, limit?: number): Promise<FeedItem[]>

  // Modération
  block(blockedID: string, blockerID: string): Promise<void>
  unblock(blockedID: string, blockerID: string): Promise<void>
  blockedUsers(userID: string): Promise<User[]>
  report(reportedID: string, reporterID: string, reason: string): Promise<void>
}
