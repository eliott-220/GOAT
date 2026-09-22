import { describe, expect, it } from 'vitest'
import type { ActivitySession } from '../src/core/models'
import { sessionsPerSport, summarizeActivity } from '../src/core/stats'
import { formatPractice, formatRelative } from '../src/ui/format'

const HOUR = 3_600_000
const DAY = 24 * HOUR
// Midi, heure locale : les jours calendaires restent les mêmes quel que soit le fuseau de la machine qui lance les tests.
const NOW = new Date(2026, 8, 21, 12, 0, 0).getTime()

let counter = 0
const session = (sportID: string, startedAt: number, durationMs?: number): ActivitySession => ({
  id: `s${++counter}`,
  userID: 'me',
  sportID,
  startedAt,
  endedAt: durationMs === undefined ? undefined : startedAt + durationMs,
})

describe('summarizeActivity', () => {
  it("n'invente rien quand il n'y a pas de session", () => {
    expect(summarizeActivity([], NOW)).toEqual({ totalSessions: 0, sessionsThisWeek: 0, timeThisWeek: 0, activeDays30: 0, favoriteSportID: undefined })
  })

  it('compte les sessions et le temps des 7 derniers jours seulement', () => {
    const summary = summarizeActivity(
      [session('run', NOW - 2 * HOUR, HOUR), session('run', NOW - 3 * DAY, 30 * 60_000), session('run', NOW - 10 * DAY, 2 * HOUR)],
      NOW,
    )
    expect(summary.totalSessions).toBe(3)
    expect(summary.sessionsThisWeek).toBe(2)
    expect(summary.timeThisWeek).toBe(HOUR + 30 * 60_000)
  })

  it("ne compte que la part récente d'une session à cheval sur la limite des 7 jours", () => {
    const started = NOW - 7 * DAY - HOUR // commencée 1 h avant la fenêtre, finie 1 h après son début : 1 h dedans
    const summary = summarizeActivity([session('run', started, 2 * HOUR)], NOW)
    expect(summary.sessionsThisWeek).toBe(0) // démarrée avant la fenêtre
    expect(summary.timeThisWeek).toBe(HOUR)
  })

  it('compte une session en cours jusqu\'à maintenant', () => {
    const summary = summarizeActivity([session('run', NOW - 45 * 60_000)], NOW)
    expect(summary.timeThisWeek).toBe(45 * 60_000)
  })

  it("compte les jours actifs, pas les sessions, sur 30 jours", () => {
    const morning = new Date(2026, 8, 20, 8, 0).getTime()
    const evening = new Date(2026, 8, 20, 19, 0).getTime()
    const other = new Date(2026, 8, 18, 9, 0).getTime()
    const old = new Date(2026, 7, 1, 9, 0).getTime() // plus de 30 jours
    const summary = summarizeActivity([session('run', morning, HOUR), session('bike', evening, HOUR), session('run', other, HOUR), session('run', old, HOUR)], NOW)
    expect(summary.activeDays30).toBe(2)
  })

  it('un même identifiant présent deux fois (session en cours + historique) est compté une fois', () => {
    const running = session('run', NOW - HOUR)
    expect(summarizeActivity([running, running], NOW).totalSessions).toBe(1)
  })

  it('le sport favori est le plus pratiqué, le plus récent en cas d\'égalité', () => {
    const summary = summarizeActivity([session('run', NOW - 5 * DAY, HOUR), session('run', NOW - 4 * DAY, HOUR), session('bike', NOW - DAY, HOUR)], NOW)
    expect(summary.favoriteSportID).toBe('run')
    const tie = summarizeActivity([session('run', NOW - 5 * DAY, HOUR), session('bike', NOW - DAY, HOUR)], NOW)
    expect(tie.favoriteSportID).toBe('bike')
  })
})

describe('sessionsPerSport', () => {
  it('compte par sport en ignorant les doublons', () => {
    const a = session('run', NOW - DAY, HOUR)
    const counts = sessionsPerSport([a, a, session('run', NOW - 2 * DAY, HOUR), session('bike', NOW - DAY, HOUR)])
    expect(counts.get('run')).toBe(2)
    expect(counts.get('bike')).toBe(1)
    expect(counts.get('ski')).toBeUndefined()
  })
})

describe('formatRelative', () => {
  it('parle en minutes, heures puis jours', () => {
    expect(formatRelative(NOW - 20_000, NOW)).toBe("à l'instant")
    expect(formatRelative(NOW - 5 * 60_000, NOW)).toBe('il y a 5 min')
    expect(formatRelative(NOW - 2 * HOUR - 10 * 60_000, NOW)).toBe('il y a 2 h')
    expect(formatRelative(NOW - 1 * DAY - HOUR, NOW)).toBe('il y a 1 j')
    expect(formatRelative(NOW - 30 * DAY, NOW)).toBe('il y a 30 j')
  })

  it('donne la date au-delà de 30 jours, et ne devient pas négatif si l\'horloge avance', () => {
    expect(formatRelative(NOW - 45 * DAY, NOW)).toMatch(/\d+ \D+/)
    expect(formatRelative(NOW + HOUR, NOW)).toBe("à l'instant")
  })
})

describe('formatPractice', () => {
  it('écrit « 0 min » plutôt que « < 1 min » pour un compteur à zéro', () => {
    expect(formatPractice(0)).toBe('0 min')
    expect(formatPractice(30_000)).toBe('0 min')
    expect(formatPractice(45 * 60_000)).toBe('45 min')
    expect(formatPractice(3 * HOUR + 20 * 60_000)).toBe('3 h 20')
  })
})
