import {
  involves,
  pairKey,
  practices,
  sessionStatus,
  type ActivitySession,
  type Alliance,
  type Block,
  type Echo,
  type User,
} from './models'

/** Relations sociales nécessaires aux règles de visibilité. */
export class SocialGraph {
  constructor(
    readonly alliances: Alliance[] = [],
    readonly blocks: Block[] = [],
  ) {}

  /** Un blocage dans un sens ou dans l'autre fait disparaître les deux profils l'un pour l'autre. */
  isBlocked(a: string, b: string): boolean {
    return this.blocks.some((x) => (x.blocker === a && x.blocked === b) || (x.blocker === b && x.blocked === a))
  }

  areAllies(a: string, b: string): boolean {
    return this.alliances.some((x) => x.status === 'accepted' && involves(x, a) && involves(x, b))
  }

  allianceBetween(a: string, b: string): Alliance | undefined {
    return this.alliances.find((x) => involves(x, a) && involves(x, b))
  }
}

/** Est-ce que `viewer` a le droit de voir la session de `target` sur la carte ? */
export function canSee(viewer: User, target: User, session: ActivitySession, graph: SocialGraph, now: number): boolean {
  // Cycle de vie de la session : valable aussi pour mon propre pin (il disparaît après le délai).
  if (!session.geohash) return false
  if (sessionStatus(session, now, target.visibility.lingerMinutes) === 'finished') return false
  // Je me vois toujours moi-même (grisé si je suis invisible) ; les autres réglages s'appliquent aux autres.
  if (viewer.id === target.id) return true
  if (graph.isBlocked(viewer.id, target.id)) return false
  if (target.visibility.isInvisible) return false

  switch (target.visibility.scope) {
    case 'everyone':
      return true
    case 'mySports':
      return practices(viewer, session.sportID)
    case 'myAlliances':
      return graph.areAllies(viewer.id, target.id)
  }
}

/** Un Echo propose un profil à un inconnu : on respecte le réglage de visibilité de la personne suggérée. */
export function canSuggest(target: User, viewer: User, graph: SocialGraph): boolean {
  if (graph.isBlocked(viewer.id, target.id)) return false
  return target.visibility.scope !== 'myAlliances'
}

export interface EchoOptions {
  /** Nombre de jours distincts de pratique dans la zone pour la considérer "récurrente". */
  minDistinctDays: number
  /** Précision du geohash définissant une zone (5 ≈ 5 km). */
  zonePrecision: number
  /** Fenêtre d'historique prise en compte. */
  windowDays: number
  /** Poids cumulé à partir duquel le score plafonne à 1. */
  scoreSaturation: number
}

export const DEFAULT_ECHO_OPTIONS: EchoOptions = { minDistinctDays: 2, zonePrecision: 5, windowDays: 60, scoreSaturation: 8 }

const DAY_MS = 86_400_000

/** Génération automatique des Echos : deux utilisateurs partageant un sport ET une zone de pratique récurrente. */
export function generateEchoes(
  sessions: ActivitySession[],
  excluded: ReadonlySet<string>,
  now: number,
  overrides: Partial<EchoOptions> = {},
): Echo[] {
  const { minDistinctDays, zonePrecision, windowDays, scoreSaturation } = { ...DEFAULT_ECHO_OPTIONS, ...overrides }
  const cutoff = now - windowDays * DAY_MS

  // (sport, zone) → utilisateur → jours distincts de pratique
  const daysByZone = new Map<string, { sportID: string; users: Map<string, Set<number>> }>()
  for (const session of sessions) {
    if (session.startedAt < cutoff || !session.geohash || session.geohash.length < zonePrecision) continue
    const key = `${session.sportID}|${session.geohash.slice(0, zonePrecision)}`
    const zone = daysByZone.get(key) ?? { sportID: session.sportID, users: new Map() }
    const days = zone.users.get(session.userID) ?? new Set<number>()
    days.add(Math.floor(session.startedAt / DAY_MS))
    zone.users.set(session.userID, days)
    daysByZone.set(key, zone)
  }

  const weights = new Map<string, { a: string; b: string; sportID: string; weight: number }>()
  for (const { sportID, users } of daysByZone.values()) {
    const regulars = [...users].filter(([, days]) => days.size >= minDistinctDays).sort(([x], [y]) => (x < y ? -1 : 1))
    for (let i = 0; i < regulars.length; i++) {
      for (let j = i + 1; j < regulars.length; j++) {
        const [idA, daysA] = regulars[i]!
        const [idB, daysB] = regulars[j]!
        const pair = pairKey(idA, idB)
        if (excluded.has(pair)) continue
        const key = `${pair}|${sportID}`
        const entry = weights.get(key) ?? { a: idA, b: idB, sportID, weight: 0 }
        entry.weight += Math.min(daysA.size, daysB.size)
        weights.set(key, entry)
      }
    }
  }

  return [...weights.entries()]
    .map(([key, { a, b, sportID, weight }]) => ({
      id: key,
      userA: a,
      userB: b,
      proximityScore: Math.min(1, weight / scoreSaturation),
      commonSportID: sportID,
    }))
    .sort((x, y) => y.proximityScore - x.proximityScore || (x.id < y.id ? -1 : 1))
}
