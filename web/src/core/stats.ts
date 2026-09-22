import type { ActivitySession } from './models'

const DAY_MS = 86_400_000

/** Chiffres du profil, calculés à partir des sessions (rien n'est stocké : tout se déduit de l'historique). */
export interface ActivitySummary {
  totalSessions: number
  /** Sessions démarrées pendant les 7 derniers jours. */
  sessionsThisWeek: number
  /** Temps de pratique cumulé pendant les 7 derniers jours (ms). Une session à cheval sur la limite n'est comptée que pour sa part récente. */
  timeThisWeek: number
  /** Jours différents (calendrier local) avec au moins une session démarrée pendant les 30 derniers jours. */
  activeDays30: number
  /** Sport le plus pratiqué (nombre de sessions) ; à égalité, celui pratiqué le plus récemment. */
  favoriteSportID?: string
}

const dayKey = (ms: number): string => {
  const date = new Date(ms)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/** `sessions` peut mélanger sessions en cours et terminées : un même identifiant n'est compté qu'une fois. */
export function summarizeActivity(sessions: readonly ActivitySession[], now: number): ActivitySummary {
  const unique = [...new Map(sessions.map((session) => [session.id, session])).values()]
  const weekStart = now - 7 * DAY_MS
  const monthStart = now - 30 * DAY_MS

  let sessionsThisWeek = 0
  let timeThisWeek = 0
  const days = new Set<string>()
  const perSport = new Map<string, { count: number; latest: number }>()

  for (const session of unique) {
    if (session.startedAt >= weekStart) sessionsThisWeek += 1
    const end = session.endedAt ?? now
    const overlap = Math.min(end, now) - Math.max(session.startedAt, weekStart)
    if (overlap > 0) timeThisWeek += overlap
    if (session.startedAt >= monthStart) days.add(dayKey(session.startedAt))

    const entry = perSport.get(session.sportID) ?? { count: 0, latest: 0 }
    perSport.set(session.sportID, { count: entry.count + 1, latest: Math.max(entry.latest, session.startedAt) })
  }

  let favoriteSportID: string | undefined
  let best: { count: number; latest: number } | undefined
  for (const [sportID, entry] of perSport) {
    if (!best || entry.count > best.count || (entry.count === best.count && entry.latest > best.latest)) {
      best = entry
      favoriteSportID = sportID
    }
  }

  return { totalSessions: unique.length, sessionsThisWeek, timeThisWeek, activeDays30: days.size, favoriteSportID }
}

/** Nombre de sessions par sport (pour le libellé « N sessions » sous chaque sport du profil). */
export function sessionsPerSport(sessions: readonly ActivitySession[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const session of new Map(sessions.map((s) => [s.id, s])).values()) counts.set(session.sportID, (counts.get(session.sportID) ?? 0) + 1)
  return counts
}
