import { describe, expect, it } from 'vitest'
import { CATEGORIES, CATEGORY_COLORS, CATEGORY_LABELS, SPORTS, searchSports, sportById, sportColor, sportName } from '../src/core/sports'

/** Ces ids sont déjà enregistrés en base : ils ne changent jamais. */
const ORIGINAL_IDS = ['ski', 'snowboard', 'surf', 'running', 'trail', 'velo', 'football', 'basket', 'tennis', 'musculation', 'yoga', 'randonnee', 'escalade', 'natation']

describe('catalogue des sports', () => {
  it('a des ids uniques (en minuscules, sans espace), un nom et un emoji pour chaque sport', () => {
    expect(new Set(SPORTS.map((s) => s.id)).size).toBe(SPORTS.length)
    for (const sport of SPORTS) {
      expect(sport.id, sport.id).toMatch(/^[a-z]+(-[a-z]+)*$/)
      expect(sport.name.trim().length, sport.id).toBeGreaterThan(0)
      expect(sport.emoji.length, sport.id).toBeGreaterThan(0)
    }
  })

  it('garde les 14 sports d\'origine', () => {
    for (const id of ORIGINAL_IDS) expect(sportById(id), id).toBeDefined()
  })

  it('couvre les activités courantes des montres Garmin et COROS', () => {
    const wanted = [
      'running', 'trail', 'piste', 'tapis', 'marche', 'velo', 'vtt', 'gravel', 'velo-electrique', 'bmx', 'velo-salle',
      'natation', 'eau-libre', 'aviron', 'kayak', 'paddle', 'voile', 'plongee', 'apnee', 'windsurf', 'kitesurf', 'wakeboard', 'surf',
      'ski', 'snowboard', 'ski-fond', 'ski-rando', 'raquettes', 'patinage', 'roller',
      'musculation', 'yoga', 'pilates', 'hiit', 'cardio', 'elliptique', 'stepper', 'escaliers', 'corde', 'mobilite', 'respiration',
      'football', 'basket', 'volleyball', 'rugby', 'baseball', 'cricket', 'hockey-glace', 'hockey-gazon', 'lacrosse', 'ultimate',
      'tennis', 'padel', 'pickleball', 'badminton', 'squash', 'tennis-de-table', 'racquetball',
      'randonnee', 'alpinisme', 'escalade', 'bloc', 'escalade-salle', 'equitation', 'golf', 'disc-golf', 'tir-arc',
      'boxe', 'mma', 'triathlon', 'duathlon', 'swimrun', 'course-aventure', 'obstacles', 'marche-lestee', 'multisport',
    ]
    for (const id of wanted) expect(sportById(id), id).toBeDefined()
    expect(SPORTS.length).toBeGreaterThanOrEqual(100)
  })

  it('a pour chaque catégorie un libellé, une couleur et au moins un sport', () => {
    for (const category of CATEGORIES) {
      expect(CATEGORY_LABELS[category], category).toBeTruthy()
      expect(CATEGORY_COLORS[category], category).toMatch(/^#[0-9a-f]{6}$/i)
      expect(SPORTS.some((s) => s.category === category), category).toBe(true)
    }
    expect(new Set(SPORTS.map((s) => s.category))).toEqual(new Set(CATEGORIES))
  })

  it('donne le nom et la couleur d\'un sport (repli sur l\'id / la couleur GOAT s\'il est inconnu)', () => {
    expect(sportName('padel')).toBe('Padel')
    expect(sportName('inconnu')).toBe('inconnu')
    expect(sportColor('padel')).toBe(CATEGORY_COLORS.raquette)
    expect(sportColor('inconnu')).toBe('#ff5c29')
  })
})

describe('recherche de sport', () => {
  const ids = (query: string) => searchSports(query).map((s) => s.id)

  it('ignore les accents et les majuscules', () => {
    expect(ids('velo')).toContain('velo') // « Vélo »
    expect(ids('VÉLO')).toContain('velo')
    expect(ids('equitation')).toEqual(['equitation']) // « Équitation »
    expect(ids('  Randonnée ')).toContain('randonnee')
  })

  it('trouve aussi par catégorie (« eau » → tous les sports d\'eau)', () => {
    const water = SPORTS.filter((s) => s.category === 'eau').map((s) => s.id)
    expect(ids('eau')).toEqual(expect.arrayContaining(water))
    expect(ids('raquette')).toEqual(expect.arrayContaining(SPORTS.filter((s) => s.category === 'raquette').map((s) => s.id)))
  })

  it('une recherche vide renvoie tout, une recherche sans résultat renvoie rien', () => {
    expect(searchSports('')).toEqual(SPORTS)
    expect(searchSports('   ')).toEqual(SPORTS)
    expect(searchSports('zzzz')).toEqual([])
  })
})
