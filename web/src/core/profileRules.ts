import type { AthleteStyleID, User, UserSport } from './models'

/** Âge minimum pour s'inscrire : GOAT montre où l'on pratique en direct, on le réserve aux personnes de 16 ans et plus. */
export const MIN_AGE = 16
export const MAX_AGE = 120

/** Lit un âge saisi (« 27 »). Renvoie undefined si ce n'est pas un entier de 1 à 3 chiffres. */
export function parseAge(text: string): number | undefined {
  const trimmed = text.trim()
  return /^\d{1,3}$/.test(trimmed) ? Number(trimmed) : undefined
}

/** Message à afficher, ou undefined si l'âge convient. */
export function ageProblem(age: number | undefined): string | undefined {
  if (age === undefined) return 'Indique ton âge (un nombre).'
  if (age < MIN_AGE) return `GOAT est réservé aux personnes de ${MIN_AGE} ans et plus.`
  if (age > MAX_AGE) return "Cet âge ne semble pas correct."
  return undefined
}

/** Tout ce que l'inscription demande avant de créer le compte. */
export interface ProfileDetails {
  firstName: string
  age: number
  athleteStyle: AthleteStyleID
  sports: UserSport[]
}

/** Profil complet : prénom, âge, style et au moins un sport. Sinon la personne repasse par l'étape « profil » à la connexion. */
export function isProfileComplete(user: User): boolean {
  return user.firstName.trim() !== '' && user.age !== undefined && user.athleteStyle !== undefined && user.sports.length > 0
}
