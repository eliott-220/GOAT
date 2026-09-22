import { encode, type GeoCoordinate } from './geohash'
import { InMemoryBackend } from './memoryBackend'
import type { ActivitySession, User, UserSport } from './models'
import { Rng } from './rng'

/** Lieux de pratique autour desquels les utilisateurs de démo sont répartis. */
export interface DemoHub {
  name: string
  latitude: number
  longitude: number
  sportIDs: string[]
}

export const DEMO_HUBS: DemoHub[] = [
  { name: 'Chamonix', latitude: 45.9237, longitude: 6.8694, sportIDs: ['ski', 'snowboard', 'trail', 'escalade', 'randonnee'] },
  { name: 'Val Thorens', latitude: 45.2979, longitude: 6.58, sportIDs: ['ski', 'snowboard'] },
  { name: 'La Plagne', latitude: 45.506, longitude: 6.677, sportIDs: ['ski', 'snowboard'] },
  { name: 'Grenoble', latitude: 45.1885, longitude: 5.7245, sportIDs: ['trail', 'escalade', 'velo', 'randonnee'] },
  { name: 'Annecy', latitude: 45.8992, longitude: 6.1294, sportIDs: ['running', 'velo', 'trail', 'natation'] },
  { name: 'Paris', latitude: 48.8566, longitude: 2.3522, sportIDs: ['running', 'musculation', 'yoga', 'football', 'tennis', 'basket'] },
  { name: 'Lyon', latitude: 45.764, longitude: 4.8357, sportIDs: ['running', 'velo', 'football', 'musculation'] },
  { name: 'Marseille', latitude: 43.2965, longitude: 5.3698, sportIDs: ['natation', 'running', 'football', 'escalade'] },
  { name: 'Nice', latitude: 43.7102, longitude: 7.262, sportIDs: ['running', 'velo', 'natation', 'trail'] },
  { name: 'Biarritz', latitude: 43.4832, longitude: -1.5586, sportIDs: ['surf', 'running', 'natation'] },
  { name: 'Hossegor', latitude: 43.666, longitude: -1.441, sportIDs: ['surf'] },
  { name: 'Bordeaux', latitude: 44.8378, longitude: -0.5792, sportIDs: ['running', 'velo', 'tennis', 'yoga'] },
  { name: 'Toulouse', latitude: 43.6047, longitude: 1.4442, sportIDs: ['running', 'football', 'tennis', 'escalade'] },
  { name: 'Nantes', latitude: 47.2184, longitude: -1.5536, sportIDs: ['running', 'velo', 'yoga', 'surf'] },
  { name: 'Lille', latitude: 50.6292, longitude: 3.0573, sportIDs: ['running', 'football', 'basket', 'musculation'] },
  { name: 'Strasbourg', latitude: 48.5734, longitude: 7.7521, sportIDs: ['running', 'velo', 'basket'] },
]

const FIRST_NAMES = [
  'Léa', 'Hugo', 'Emma', 'Louis', 'Chloé', 'Jules', 'Manon', 'Adam', 'Camille', 'Nathan',
  'Inès', 'Lucas', 'Sarah', 'Théo', 'Zoé', 'Maxime', 'Lola', 'Tom', 'Jade', 'Enzo',
  'Anaïs', 'Paul', 'Clara', 'Noah', 'Alice', 'Mathis', 'Louise', 'Arthur', 'Eva', 'Gabriel',
  'Romane', 'Antoine', 'Juliette', 'Baptiste', 'Margaux', 'Victor', 'Océane', 'Clément', 'Elise', 'Raphaël',
  'Margot', 'Axel', 'Lucie', 'Simon', 'Pauline', 'Quentin', 'Marion', 'Yanis', 'Laura', 'Mehdi',
]

const BIOS = ['', '', 'Toujours partant pour une sortie.', 'Fan de sorties matinales.', 'Je cherche des partenaires de pratique.', 'Weekend = dehors.']

const DAY_MS = 86_400_000

function jitter(center: GeoCoordinate, meters: number, rng: Rng): GeoCoordinate {
  const dLat = rng.range(-meters, meters) / 111_000
  const dLon = rng.range(-meters, meters) / (111_000 * Math.cos((center.latitude * Math.PI) / 180))
  return { latitude: center.latitude + dLat, longitude: center.longitude + dLon }
}

export interface PopulateOptions {
  botCount?: number
  seed?: number
  now?: number
}

/**
 * Remplit le backend avec des utilisateurs simulés (profils, historique récent, sessions en cours)
 * et renvoie le simulateur qui les fait vivre.
 */
export async function populate(backend: InMemoryBackend, options: PopulateOptions = {}): Promise<DemoSimulator> {
  const { botCount = 120, seed = 42, now = Date.now() } = options
  const rng = new Rng(seed)
  const bots: User[] = []
  const history: ActivitySession[] = []
  const homes = new Map<string, { sportID: string; home: GeoCoordinate }[]>()

  for (let index = 0; index < botCount; index++) {
    const hub = DEMO_HUBS[index % DEMO_HUBS.length]!
    const sportIDs = rng.shuffle(hub.sportIDs).slice(0, rng.int(1, Math.min(3, hub.sportIDs.length)))
    const sports: UserSport[] = sportIDs.map((sportID, i) => ({ sportID, isPrimary: i === 0 }))
    const user: User = {
      id: rng.uuid(),
      firstName: FIRST_NAMES[index % FIRST_NAMES.length]!,
      bio: rng.pick(BIOS),
      sports,
      visibility: { scope: rng.int(0, 9) === 0 ? 'mySports' : 'everyone', isInvisible: false, lingerMinutes: 15 },
      joinedAt: now - rng.int(5, 400) * DAY_MS,
    }
    bots.push(user)

    // Une zone de pratique habituelle par sport, proche du hub.
    const spots: { sportID: string; home: GeoCoordinate }[] = []
    for (const sportID of sportIDs) {
      const home = jitter(hub, 2_500, rng)
      spots.push({ sportID, home })
      // Sessions passées sur des jours distincts, dans le voisinage immédiat du spot.
      const days = new Set(Array.from({ length: rng.int(2, 5) }, () => rng.int(1, 25)))
      for (const day of days) {
        const place = jitter(home, 300, rng)
        const startedAt = now - day * DAY_MS - rng.int(0, 40_000) * 1000
        history.push({
          id: rng.uuid(),
          userID: user.id,
          sportID,
          geohash: encode(place.latitude, place.longitude),
          startedAt,
          endedAt: startedAt + rng.int(1_800, 9_000) * 1000,
        })
      }
    }
    homes.set(user.id, spots)
  }

  backend.seed(bots, history)
  const simulator = new DemoSimulator(backend, bots, homes, rng)
  await simulator.startInitialSessions(0.35)
  return simulator
}

/**
 * Fait vivre les utilisateurs de démo en passant par l'API publique du backend
 * (comme le ferait un vrai client) : la carte bouge, des sessions démarrent et s'arrêtent.
 */
export class DemoSimulator {
  private current = new Map<string, { sessionID: string; position: GeoCoordinate }>()

  constructor(
    private readonly backend: InMemoryBackend,
    private readonly bots: User[],
    private readonly homes: Map<string, { sportID: string; home: GeoCoordinate }[]>,
    private readonly rng: Rng,
  ) {}

  async startInitialSessions(activeRatio: number): Promise<void> {
    for (const bot of this.bots) {
      if (this.rng.next() < activeRatio) await this.start(bot)
    }
  }

  /** À appeler périodiquement (toutes les quelques secondes). */
  async tick(): Promise<void> {
    for (const bot of this.bots) {
      const running = this.current.get(bot.id)
      if (running) {
        if (this.rng.next() < 0.03) {
          await this.backend.stopSession(running.sessionID).catch(() => undefined)
          this.current.delete(bot.id)
        } else {
          // Marche aléatoire de quelques dizaines de mètres.
          const next = jitter(running.position, 150, this.rng)
          await this.backend.updatePosition(running.sessionID, next.latitude, next.longitude).catch(() => undefined)
          this.current.set(bot.id, { sessionID: running.sessionID, position: next })
        }
      } else if (this.rng.next() < 0.02) {
        await this.start(bot)
      }
    }
  }

  /** Un lieu de pratique habituel d'un utilisateur de démo pour ce sport (sert aux outils de démo des Echos). */
  spot(sportID: string): GeoCoordinate | undefined {
    for (const bot of this.bots) {
      const spot = this.homes.get(bot.id)?.find((s) => s.sportID === sportID)
      if (spot) return spot.home
    }
    return undefined
  }

  private async start(bot: User): Promise<void> {
    const spots = this.homes.get(bot.id)
    if (!spots?.length) return
    const spot = this.rng.pick(spots)
    const session = await this.backend.startSession(bot.id, spot.sportID).catch(() => undefined)
    if (!session) return
    const position = jitter(spot.home, 300, this.rng)
    await this.backend.updatePosition(session.id, position.latitude, position.longitude).catch(() => undefined)
    this.current.set(bot.id, { sessionID: session.id, position })
  }
}
