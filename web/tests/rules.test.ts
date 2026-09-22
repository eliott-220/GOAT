import { describe, expect, it } from 'vitest'
import {
  makePrimary,
  pairKey,
  sessionStatus,
  toggleSport,
  type ActivitySession,
  type User,
  type UserSport,
  type VisibilityScope,
} from '../src/core/models'
import { canSee, generateEchoes, SocialGraph } from '../src/core/rules'

const NOW = 1_800_000_000_000
const MIN = 60_000
const DAY = 86_400_000

let counter = 0
function user(name: string, sports: string[] = ['ski'], scope: VisibilityScope = 'everyone'): User {
  return {
    id: `user-${name}-${counter++}`,
    firstName: name,
    bio: '',
    sports: sports.map((sportID) => ({ sportID, isPrimary: false })),
    visibility: { scope, isInvisible: false, lingerMinutes: 15 },
    joinedAt: NOW,
  }
}

function liveSession(u: User, sport = 'ski', endedMinutesAgo?: number): ActivitySession {
  return {
    id: `s-${counter++}`,
    userID: u.id,
    sportID: sport,
    geohash: 'u0h4s5p',
    startedAt: NOW - 120 * MIN,
    endedAt: endedMinutesAgo === undefined ? undefined : NOW - endedMinutesAgo * MIN,
  }
}

describe('statut de session', () => {
  it('actif → récemment actif → terminé, avec un délai réglable', () => {
    const running: ActivitySession = { id: 'x', userID: 'u', sportID: 'ski', startedAt: NOW - 10 * MIN }
    expect(sessionStatus(running, NOW, 15)).toBe('active')

    expect(sessionStatus({ ...running, endedAt: NOW - 14 * MIN }, NOW, 15)).toBe('recentlyActive')
    expect(sessionStatus({ ...running, endedAt: NOW - 16 * MIN }, NOW, 15)).toBe('finished')
    expect(sessionStatus({ ...running, endedAt: NOW - 16 * MIN }, NOW, 30)).toBe('recentlyActive')
  })
})

describe('visibilité', () => {
  const graph = new SocialGraph()

  it('tout le monde voit un profil public', () => {
    const target = user('B')
    expect(canSee(user('A', ['surf']), target, liveSession(target), graph, NOW)).toBe(true)
  })

  it('"mes sports" exige un sport en commun', () => {
    const target = user('B', ['ski'], 'mySports')
    const session = liveSession(target)
    expect(canSee(user('A', ['ski']), target, session, graph, NOW)).toBe(true)
    expect(canSee(user('C', ['surf']), target, session, graph, NOW)).toBe(false)
  })

  it('"mes Alliances" exige une Alliance acceptée', () => {
    const target = user('B', ['ski'], 'myAlliances')
    const viewer = user('A')
    const session = liveSession(target)
    const pending = new SocialGraph([{ id: '1', userA: viewer.id, userB: target.id, status: 'pending' }])
    const accepted = new SocialGraph([{ id: '1', userA: viewer.id, userB: target.id, status: 'accepted' }])
    expect(canSee(viewer, target, session, pending, NOW)).toBe(false)
    expect(canSee(viewer, target, session, accepted, NOW)).toBe(true)
  })

  it('un utilisateur invisible est masqué même en session active', () => {
    const target = user('B')
    target.visibility.isInvisible = true
    expect(canSee(user('A'), target, liveSession(target), graph, NOW)).toBe(false)
  })

  it('une session sans position est invisible', () => {
    const target = user('B')
    expect(canSee(user('A'), target, { ...liveSession(target), geohash: undefined }, graph, NOW)).toBe(false)
  })

  it('une session terminée disparaît, une session récente reste visible', () => {
    const target = user('B')
    const viewer = user('A')
    expect(canSee(viewer, target, liveSession(target, 'ski', 10), graph, NOW)).toBe(true)
    expect(canSee(viewer, target, liveSession(target, 'ski', 20), graph, NOW)).toBe(false)
  })

  it('mon propre pin suit le cycle de vie de la session (il ne reste pas affiché indéfiniment)', () => {
    const me = user('A')
    expect(canSee(me, me, liveSession(me), graph, NOW)).toBe(true)
    expect(canSee(me, me, liveSession(me, 'ski', 10), graph, NOW)).toBe(true)
    expect(canSee(me, me, liveSession(me, 'ski', 20), graph, NOW)).toBe(false)
    expect(canSee(me, me, { ...liveSession(me), geohash: undefined }, graph, NOW)).toBe(false)
  })

  it('un blocage masque les deux profils dans les deux sens', () => {
    const a = user('A')
    const b = user('B')
    const blocked = new SocialGraph([], [{ blocker: a.id, blocked: b.id }])
    expect(canSee(a, b, liveSession(b), blocked, NOW)).toBe(false)
    expect(canSee(b, a, liveSession(a), blocked, NOW)).toBe(false)
  })
})

describe('Echos', () => {
  const session = (userID: string, sportID: string, dayOffset: number, geohash = 'u0h4s5p'): ActivitySession => ({
    id: `e-${counter++}`,
    userID,
    sportID,
    geohash,
    startedAt: NOW - dayOffset * DAY,
  })

  it('exige un sport commun ET une zone récurrente', () => {
    const sessions = [
      session('a', 'ski', 1), session('a', 'ski', 3),
      session('b', 'ski', 2), session('b', 'ski', 5),
      session('c', 'ski', 1), // une seule journée : pas récurrent
      session('c', 'surf', 4), session('c', 'surf', 6), // autre sport
    ]
    const echoes = generateEchoes(sessions, new Set(), NOW)
    expect(echoes).toHaveLength(1)
    expect(echoes[0]!.commonSportID).toBe('ski')
    expect(new Set([echoes[0]!.userA, echoes[0]!.userB])).toEqual(new Set(['a', 'b']))
  })

  it('exige la même zone', () => {
    const sessions = [session('a', 'running', 1, 'u09tv12'), session('a', 'running', 2, 'u09tv12'), session('b', 'running', 1, 'spey61y'), session('b', 'running', 2, 'spey61y')]
    expect(generateEchoes(sessions, new Set(), NOW)).toEqual([])
  })

  it('ignore les paires exclues et les sessions trop anciennes', () => {
    const recent = [session('a', 'ski', 1), session('a', 'ski', 2), session('b', 'ski', 1), session('b', 'ski', 2)]
    expect(generateEchoes(recent, new Set(), NOW)).toHaveLength(1)
    expect(generateEchoes(recent, new Set([pairKey('a', 'b')]), NOW)).toEqual([])

    const old = [session('a', 'ski', 100), session('a', 'ski', 101), session('b', 'ski', 100), session('b', 'ski', 101)]
    expect(generateEchoes(old, new Set(), NOW)).toEqual([])
  })
})

describe('sélection de sports', () => {
  const ids = (sports: UserSport[]) => sports.map((s) => `${s.sportID}${s.isPrimary ? '*' : ''}`)

  it('le premier sport devient le principal', () => {
    expect(ids(toggleSport(toggleSport([], 'ski'), 'trail'))).toEqual(['ski*', 'trail'])
  })

  it('retirer le principal en promeut un autre', () => {
    const sports = toggleSport([{ sportID: 'ski', isPrimary: true }, { sportID: 'trail', isPrimary: false }], 'ski')
    expect(ids(sports)).toEqual(['trail*'])
    expect(toggleSport(sports, 'trail')).toEqual([])
  })

  it('makePrimary garde exactement un principal', () => {
    const start: UserSport[] = [{ sportID: 'ski', isPrimary: true }, { sportID: 'trail', isPrimary: false }, { sportID: 'yoga', isPrimary: false }]
    expect(ids(makePrimary(start, 'yoga'))).toEqual(['ski', 'trail', 'yoga*'])
    expect(makePrimary(start, 'surf')).toBe(start) // pas dans la liste : sans effet
  })
})
