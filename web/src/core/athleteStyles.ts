import type { AthleteStyleID } from './models'

/**
 * « Style de sportif » choisi à l'inscription : un badge qui dit dans quel esprit on pratique.
 * Les ids sont enregistrés en base (colonne `profiles.athlete_style`, voir supabase/migrations) : ne jamais en renommer un.
 */
export interface AthleteStyle {
  id: AthleteStyleID
  name: string
  emoji: string
  /** Une phrase pour se reconnaître. */
  tagline: string
}

export const ATHLETE_STYLES: readonly AthleteStyle[] = [
  { id: 'adventurer', name: 'Aventurier', emoji: '🧭', tagline: "J'explore de nouveaux terrains" },
  { id: 'competitor', name: 'Compétiteur', emoji: '🏆', tagline: 'Je vise la performance et les défis' },
  { id: 'fun', name: 'Pour le plaisir', emoji: '😄', tagline: 'Je bouge pour me faire du bien' },
  { id: 'team', name: "Esprit d'équipe", emoji: '🤝', tagline: 'Le sport, c’est mieux à plusieurs' },
  { id: 'wellbeing', name: 'Bien-être', emoji: '🌿', tagline: 'Équilibre, souplesse et sérénité' },
  { id: 'regular', name: 'Assidu', emoji: '🔥', tagline: "Je m'entraîne toute l'année" },
]

const BY_ID = new Map<string, AthleteStyle>(ATHLETE_STYLES.map((style) => [style.id, style]))

export function athleteStyleById(id: string | undefined | null): AthleteStyle | undefined {
  return id ? BY_ID.get(id) : undefined
}

export function isAthleteStyleID(value: unknown): value is AthleteStyleID {
  return typeof value === 'string' && BY_ID.has(value)
}
