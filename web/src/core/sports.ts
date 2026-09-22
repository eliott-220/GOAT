/**
 * Catalogue des sports, en français. Inspiré des activités des montres Garmin (fēnix 8) et COROS, sans les activités
 * motorisées ni celles qui ne sont pas du sport (jeux vidéo, chasse, pêche…), avec quelques sports populaires en plus.
 *
 * Les ids sont enregistrés en base (table `sports`, voir supabase/migrations) : ne jamais en renommer un, et garder ce fichier
 * identique à la base (un test le vérifie). Ajouter un sport = une ligne ici + une migration SQL.
 */
export type SportCategory = 'glisse' | 'course' | 'velo' | 'ballon' | 'raquette' | 'salle' | 'nature' | 'eau' | 'combat' | 'multi'

export const CATEGORIES: SportCategory[] = ['glisse', 'course', 'velo', 'ballon', 'raquette', 'salle', 'nature', 'eau', 'combat', 'multi']

export const CATEGORY_LABELS: Record<SportCategory, string> = {
  glisse: 'Glisse',
  course: 'Course & marche',
  velo: 'Vélo',
  ballon: 'Sports de balle',
  raquette: 'Raquette',
  salle: 'Salle & bien-être',
  nature: 'Nature & plein air',
  eau: 'Eau',
  combat: 'Combat',
  multi: 'Multisport',
}

export const CATEGORY_COLORS: Record<SportCategory, string> = {
  glisse: '#3399f2',
  course: '#ff9500',
  velo: '#e0a100',
  ballon: '#33ad59',
  raquette: '#8cbf26',
  salle: '#af52de',
  nature: '#997040',
  eau: '#30b0c7',
  combat: '#e5484d',
  multi: '#5e5ce6',
}

export interface Sport {
  id: string
  name: string
  category: SportCategory
  emoji: string
}

export const SPORTS: Sport[] = [
  // Glisse
  { id: 'ski', name: 'Ski', category: 'glisse', emoji: '⛷️' },
  { id: 'snowboard', name: 'Snowboard', category: 'glisse', emoji: '🏂' },
  { id: 'ski-fond', name: 'Ski de fond', category: 'glisse', emoji: '🎿' },
  { id: 'ski-rando', name: 'Ski de randonnée', category: 'glisse', emoji: '🎿' },
  { id: 'snowboard-rando', name: 'Snowboard de randonnée', category: 'glisse', emoji: '🏂' },
  { id: 'raquettes', name: 'Raquettes à neige', category: 'glisse', emoji: '❄️' },
  { id: 'patinage', name: 'Patinage sur glace', category: 'glisse', emoji: '⛸️' },
  { id: 'roller', name: 'Roller', category: 'glisse', emoji: '🛼' },
  { id: 'skateboard', name: 'Skateboard', category: 'glisse', emoji: '🛹' },
  { id: 'surf', name: 'Surf', category: 'glisse', emoji: '🏄' },
  { id: 'windsurf', name: 'Planche à voile', category: 'glisse', emoji: '🏄' },
  { id: 'kitesurf', name: 'Kitesurf', category: 'glisse', emoji: '🪁' },
  { id: 'speedsurf', name: 'Speedsurf', category: 'glisse', emoji: '💨' },
  { id: 'wakeboard', name: 'Wakeboard', category: 'glisse', emoji: '🌊' },
  { id: 'wakesurf', name: 'Wakesurf', category: 'glisse', emoji: '🏄' },
  { id: 'ski-nautique', name: 'Ski nautique', category: 'glisse', emoji: '🚤' },

  // Course & marche
  { id: 'running', name: 'Course à pied', category: 'course', emoji: '🏃' },
  { id: 'trail', name: 'Trail', category: 'course', emoji: '🏔️' },
  { id: 'piste', name: 'Course sur piste', category: 'course', emoji: '🏟️' },
  { id: 'tapis', name: 'Tapis de course', category: 'course', emoji: '🏃' },
  { id: 'obstacles', name: "Course d'obstacles", category: 'course', emoji: '🚧' },
  { id: 'marche', name: 'Marche', category: 'course', emoji: '🚶' },
  { id: 'marche-lestee', name: 'Marche lestée', category: 'course', emoji: '🎒' },

  // Vélo
  { id: 'velo', name: 'Vélo', category: 'velo', emoji: '🚴' },
  { id: 'vtt', name: 'VTT', category: 'velo', emoji: '🚵' },
  { id: 'gravel', name: 'Gravel', category: 'velo', emoji: '🚲' },
  { id: 'cyclocross', name: 'Cyclo-cross', category: 'velo', emoji: '🚴' },
  { id: 'velo-electrique', name: 'Vélo électrique', category: 'velo', emoji: '⚡' },
  { id: 'vtt-electrique', name: 'VTT électrique', category: 'velo', emoji: '🚵' },
  { id: 'bmx', name: 'BMX', category: 'velo', emoji: '🚲' },
  { id: 'velo-salle', name: "Vélo d'appartement", category: 'velo', emoji: '🚴' },
  { id: 'cyclotourisme', name: 'Cyclotourisme', category: 'velo', emoji: '🗺️' },
  { id: 'velotaf', name: 'Vélotaf', category: 'velo', emoji: '🏙️' },

  // Sports de balle
  { id: 'football', name: 'Football', category: 'ballon', emoji: '⚽' },
  { id: 'futsal', name: 'Futsal', category: 'ballon', emoji: '⚽' },
  { id: 'basket', name: 'Basket', category: 'ballon', emoji: '🏀' },
  { id: 'volleyball', name: 'Volley-ball', category: 'ballon', emoji: '🏐' },
  { id: 'beach-volley', name: 'Beach-volley', category: 'ballon', emoji: '🏖️' },
  { id: 'handball', name: 'Handball', category: 'ballon', emoji: '🤾' },
  { id: 'rugby', name: 'Rugby', category: 'ballon', emoji: '🏉' },
  { id: 'football-americain', name: 'Football américain', category: 'ballon', emoji: '🏈' },
  { id: 'baseball', name: 'Baseball', category: 'ballon', emoji: '⚾' },
  { id: 'softball', name: 'Softball', category: 'ballon', emoji: '🥎' },
  { id: 'cricket', name: 'Cricket', category: 'ballon', emoji: '🏏' },
  { id: 'hockey-gazon', name: 'Hockey sur gazon', category: 'ballon', emoji: '🏑' },
  { id: 'hockey-glace', name: 'Hockey sur glace', category: 'ballon', emoji: '🏒' },
  { id: 'lacrosse', name: 'Crosse (lacrosse)', category: 'ballon', emoji: '🥍' },
  { id: 'ultimate', name: 'Ultimate', category: 'ballon', emoji: '🥏' },

  // Raquette
  { id: 'tennis', name: 'Tennis', category: 'raquette', emoji: '🎾' },
  { id: 'padel', name: 'Padel', category: 'raquette', emoji: '🎾' },
  { id: 'pickleball', name: 'Pickleball', category: 'raquette', emoji: '🏓' },
  { id: 'badminton', name: 'Badminton', category: 'raquette', emoji: '🏸' },
  { id: 'squash', name: 'Squash', category: 'raquette', emoji: '🎾' },
  { id: 'tennis-de-table', name: 'Tennis de table', category: 'raquette', emoji: '🏓' },
  { id: 'racquetball', name: 'Racquetball', category: 'raquette', emoji: '🎾' },

  // Salle & bien-être
  { id: 'musculation', name: 'Musculation', category: 'salle', emoji: '🏋️' },
  { id: 'crossfit', name: 'CrossFit', category: 'salle', emoji: '💪' },
  { id: 'hiit', name: 'HIIT', category: 'salle', emoji: '⏱️' },
  { id: 'cardio', name: 'Cardio training', category: 'salle', emoji: '❤️' },
  { id: 'elliptique', name: 'Vélo elliptique', category: 'salle', emoji: '🌀' },
  { id: 'stepper', name: 'Stepper', category: 'salle', emoji: '🪜' },
  { id: 'escaliers', name: "Montée d'escaliers", category: 'salle', emoji: '🏢' },
  { id: 'corde', name: 'Corde à sauter', category: 'salle', emoji: '🪢' },
  { id: 'yoga', name: 'Yoga', category: 'salle', emoji: '🧘' },
  { id: 'pilates', name: 'Pilates', category: 'salle', emoji: '🤸' },
  { id: 'mobilite', name: 'Mobilité & étirements', category: 'salle', emoji: '🙆' },
  { id: 'respiration', name: 'Respiration (breathwork)', category: 'salle', emoji: '🌬️' },
  { id: 'meditation', name: 'Méditation', category: 'salle', emoji: '🧠' },
  { id: 'danse', name: 'Danse', category: 'salle', emoji: '💃' },
  { id: 'gymnastique', name: 'Gymnastique', category: 'salle', emoji: '🤸' },

  // Nature & plein air
  { id: 'randonnee', name: 'Randonnée', category: 'nature', emoji: '🥾' },
  { id: 'alpinisme', name: 'Alpinisme', category: 'nature', emoji: '🏔️' },
  { id: 'escalade', name: 'Escalade', category: 'nature', emoji: '🧗' },
  { id: 'bloc', name: 'Bloc', category: 'nature', emoji: '🧗' },
  { id: 'escalade-salle', name: 'Escalade en salle', category: 'nature', emoji: '🧗' },
  { id: 'equitation', name: 'Équitation', category: 'nature', emoji: '🏇' },
  { id: 'golf', name: 'Golf', category: 'nature', emoji: '⛳' },
  { id: 'disc-golf', name: 'Disc golf', category: 'nature', emoji: '🥏' },
  { id: 'tir-arc', name: "Tir à l'arc", category: 'nature', emoji: '🏹' },

  // Eau
  { id: 'natation', name: 'Natation', category: 'eau', emoji: '🏊' },
  { id: 'eau-libre', name: 'Natation en eau libre', category: 'eau', emoji: '🏊' },
  { id: 'aviron', name: 'Aviron', category: 'eau', emoji: '🚣' },
  { id: 'aviron-salle', name: 'Aviron en salle', category: 'eau', emoji: '🚣' },
  { id: 'kayak', name: 'Kayak & canoë', category: 'eau', emoji: '🛶' },
  { id: 'eau-vive', name: 'Eau vive', category: 'eau', emoji: '🛶' },
  { id: 'paddle', name: 'Paddle', category: 'eau', emoji: '🏄' },
  { id: 'voile', name: 'Voile', category: 'eau', emoji: '⛵' },
  { id: 'plongee', name: 'Plongée', category: 'eau', emoji: '🤿' },
  { id: 'apnee', name: 'Apnée', category: 'eau', emoji: '🤿' },
  { id: 'snorkeling', name: 'Snorkeling', category: 'eau', emoji: '🤿' },
  { id: 'water-polo', name: 'Water-polo', category: 'eau', emoji: '🤽' },

  // Combat
  { id: 'boxe', name: 'Boxe', category: 'combat', emoji: '🥊' },
  { id: 'mma', name: 'MMA', category: 'combat', emoji: '🥋' },
  { id: 'judo', name: 'Judo', category: 'combat', emoji: '🥋' },
  { id: 'karate', name: 'Karaté', category: 'combat', emoji: '🥋' },
  { id: 'taekwondo', name: 'Taekwondo', category: 'combat', emoji: '🥋' },
  { id: 'jiu-jitsu', name: 'Jiu-jitsu', category: 'combat', emoji: '🥋' },
  { id: 'lutte', name: 'Lutte', category: 'combat', emoji: '🤼' },
  { id: 'escrime', name: 'Escrime', category: 'combat', emoji: '🤺' },

  // Multisport
  { id: 'triathlon', name: 'Triathlon', category: 'multi', emoji: '🏊' },
  { id: 'duathlon', name: 'Duathlon', category: 'multi', emoji: '🏃' },
  { id: 'swimrun', name: 'Swimrun', category: 'multi', emoji: '🏊' },
  { id: 'course-aventure', name: "Course d'aventure", category: 'multi', emoji: '🧭' },
  { id: 'multisport', name: 'Multisport', category: 'multi', emoji: '🎽' },
]

const BY_ID = new Map(SPORTS.map((sport) => [sport.id, sport]))

export function sportById(id: string): Sport | undefined {
  return BY_ID.get(id)
}

export function sportName(id: string): string {
  return BY_ID.get(id)?.name ?? id
}

export function sportColor(id: string): string {
  const sport = BY_ID.get(id)
  return sport ? CATEGORY_COLORS[sport.category] : '#ff5c29'
}

/** Minuscules et sans accents : « Vélo » et « velo », « Équitation » et « equitation » se retrouvent mutuellement. */
export const normalizeForSearch = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/** Sports dont le nom, ou la catégorie, contient la recherche (« eau » → tous les sports d'eau). Recherche vide : tous. */
export function searchSports(query: string): Sport[] {
  const needle = normalizeForSearch(query)
  if (!needle) return SPORTS
  return SPORTS.filter(
    (sport) => normalizeForSearch(sport.name).includes(needle) || normalizeForSearch(CATEGORY_LABELS[sport.category]).includes(needle),
  )
}
