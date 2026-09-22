import { describe, expect, it } from 'vitest'
import { ATHLETE_STYLES, athleteStyleById, isAthleteStyleID } from '../src/core/athleteStyles'
import type { User } from '../src/core/models'
import { MAX_AGE, MIN_AGE, ageProblem, isProfileComplete, parseAge } from '../src/core/profileRules'

const user = (overrides: Partial<User> = {}): User => ({
  id: 'u1',
  firstName: 'Léa',
  bio: '',
  age: 27,
  athleteStyle: 'adventurer',
  sports: [{ sportID: 'ski', isPrimary: true }],
  visibility: { scope: 'everyone', isInvisible: false, lingerMinutes: 15 },
  joinedAt: 0,
  ...overrides,
})

describe('âge', () => {
  it('lit un âge saisi', () => {
    expect(parseAge('27')).toBe(27)
    expect(parseAge(' 27 ')).toBe(27)
    expect(parseAge('007')).toBe(7)
  })

  it('refuse tout ce qui n\'est pas un entier de 1 à 3 chiffres', () => {
    for (const text of ['', '  ', '27 ans', '-3', '2.5', '2,5', '1234', 'vingt']) expect(parseAge(text), text).toBeUndefined()
  })

  it('accepte à partir de l\'âge minimum, refuse en dessous et au-delà de l\'invraisemblable', () => {
    expect(ageProblem(MIN_AGE)).toBeUndefined()
    expect(ageProblem(MAX_AGE)).toBeUndefined()
    expect(ageProblem(MIN_AGE - 1)).toMatch(/réservé aux personnes de 16 ans et plus/)
    expect(ageProblem(MAX_AGE + 1)).toBeDefined()
    expect(ageProblem(undefined)).toMatch(/âge/)
  })
})

describe('profil complet', () => {
  it('exige prénom, âge, style et au moins un sport', () => {
    expect(isProfileComplete(user())).toBe(true)
    expect(isProfileComplete(user({ firstName: '  ' }))).toBe(false)
    expect(isProfileComplete(user({ age: undefined }))).toBe(false)
    expect(isProfileComplete(user({ athleteStyle: undefined }))).toBe(false)
    expect(isProfileComplete(user({ sports: [] }))).toBe(false)
  })
})

describe('styles de sportif', () => {
  it('ont des ids uniques, un nom, un emoji et une phrase', () => {
    expect(new Set(ATHLETE_STYLES.map((s) => s.id)).size).toBe(ATHLETE_STYLES.length)
    for (const style of ATHLETE_STYLES) {
      expect(style.name.length).toBeGreaterThan(0)
      expect(style.emoji.length).toBeGreaterThan(0)
      expect(style.tagline.length).toBeGreaterThan(0)
    }
  })

  it('proposent au moins l\'aventurier, le compétiteur et « pour le plaisir »', () => {
    const ids = ATHLETE_STYLES.map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining(['adventurer', 'competitor', 'fun']))
    expect(athleteStyleById('competitor')?.name).toBe('Compétiteur')
  })

  it('reconnaissent leurs ids et rien d\'autre', () => {
    expect(isAthleteStyleID('fun')).toBe(true)
    expect(isAthleteStyleID('super-heros')).toBe(false)
    expect(isAthleteStyleID(null)).toBe(false)
    expect(athleteStyleById(undefined)).toBeUndefined()
  })
})
