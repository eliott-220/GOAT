import Foundation

/// Générateur pseudo-aléatoire déterministe (SplitMix64) pour des démos et des tests reproductibles.
public struct SeededGenerator: RandomNumberGenerator, Sendable {
    private var state: UInt64

    public init(seed: UInt64) { state = seed }

    public mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

/// Lieux de pratique autour desquels les utilisateurs de démo sont répartis.
struct DemoHub: Sendable {
    let name: String
    let latitude: Double
    let longitude: Double
    let sportIDs: [String]
}

public enum DemoData {
    static let hubs: [DemoHub] = [
        DemoHub(name: "Chamonix", latitude: 45.9237, longitude: 6.8694, sportIDs: ["ski", "snowboard", "trail", "escalade", "randonnee"]),
        DemoHub(name: "Val Thorens", latitude: 45.2979, longitude: 6.5800, sportIDs: ["ski", "snowboard"]),
        DemoHub(name: "La Plagne", latitude: 45.5060, longitude: 6.6770, sportIDs: ["ski", "snowboard"]),
        DemoHub(name: "Grenoble", latitude: 45.1885, longitude: 5.7245, sportIDs: ["trail", "escalade", "velo", "randonnee"]),
        DemoHub(name: "Annecy", latitude: 45.8992, longitude: 6.1294, sportIDs: ["running", "velo", "trail", "natation"]),
        DemoHub(name: "Paris", latitude: 48.8566, longitude: 2.3522, sportIDs: ["running", "musculation", "yoga", "football", "tennis", "basket"]),
        DemoHub(name: "Lyon", latitude: 45.7640, longitude: 4.8357, sportIDs: ["running", "velo", "football", "musculation"]),
        DemoHub(name: "Marseille", latitude: 43.2965, longitude: 5.3698, sportIDs: ["natation", "running", "football", "escalade"]),
        DemoHub(name: "Nice", latitude: 43.7102, longitude: 7.2620, sportIDs: ["running", "velo", "natation", "trail"]),
        DemoHub(name: "Biarritz", latitude: 43.4832, longitude: -1.5586, sportIDs: ["surf", "running", "natation"]),
        DemoHub(name: "Hossegor", latitude: 43.6660, longitude: -1.4410, sportIDs: ["surf"]),
        DemoHub(name: "Bordeaux", latitude: 44.8378, longitude: -0.5792, sportIDs: ["running", "velo", "tennis", "yoga"]),
        DemoHub(name: "Toulouse", latitude: 43.6047, longitude: 1.4442, sportIDs: ["running", "football", "tennis", "escalade"]),
        DemoHub(name: "Nantes", latitude: 47.2184, longitude: -1.5536, sportIDs: ["running", "velo", "yoga", "surf"]),
        DemoHub(name: "Lille", latitude: 50.6292, longitude: 3.0573, sportIDs: ["running", "football", "basket", "musculation"]),
        DemoHub(name: "Strasbourg", latitude: 48.5734, longitude: 7.7521, sportIDs: ["running", "velo", "basket"]),
    ]

    static let firstNames = [
        "Léa", "Hugo", "Emma", "Louis", "Chloé", "Jules", "Manon", "Adam", "Camille", "Nathan",
        "Inès", "Lucas", "Sarah", "Théo", "Zoé", "Maxime", "Lola", "Tom", "Jade", "Enzo",
        "Anaïs", "Paul", "Clara", "Noah", "Alice", "Mathis", "Louise", "Arthur", "Eva", "Gabriel",
        "Romane", "Antoine", "Juliette", "Baptiste", "Margaux", "Victor", "Océane", "Clément", "Elise", "Raphaël",
        "Margot", "Axel", "Lucie", "Simon", "Pauline", "Quentin", "Marion", "Yanis", "Laura", "Mehdi",
    ]

    static let bios = [
        "", "", "Toujours partant pour une sortie.", "Fan de sorties matinales.",
        "Je cherche des partenaires de pratique.", "Weekend = dehors.",
    ]

    /// Remplit le backend avec des utilisateurs simulés (profils, historique récent, sessions en cours)
    /// et renvoie le simulateur qui les fait vivre.
    @discardableResult
    public static func populate(
        _ backend: InMemoryBackend, botCount: Int = 120, seed: UInt64 = 42, now: Date = Date()
    ) async -> DemoSimulator {
        var rng = SeededGenerator(seed: seed)
        var bots: [User] = []
        var history: [ActivitySession] = []
        var homes: [UUID: [(sportID: String, home: GeoCoordinate)]] = [:]

        for index in 0..<botCount {
            let hub = hubs[index % hubs.count]
            let name = firstNames[index % firstNames.count]
            let sportIDs = Array(hub.sportIDs.shuffled(using: &rng).prefix(Int.random(in: 1...min(3, hub.sportIDs.count), using: &rng)))
            let scope: VisibilityScope = Int.random(in: 0..<10, using: &rng) == 0 ? .mySports : .everyone
            let user = User(
                id: uuid(&rng), firstName: name, bio: bios.randomElement(using: &rng) ?? "",
                sports: sportIDs.enumerated().map { UserSport(sportID: $1, isPrimary: $0 == 0) },
                visibility: VisibilitySettings(scope: scope, isInvisible: false, lingerMinutes: 15),
                joinedAt: now.addingTimeInterval(-Double(Int.random(in: 5...400, using: &rng)) * 86_400)
            )
            bots.append(user)

            // Une zone de pratique habituelle par sport, proche du hub.
            var spots: [(String, GeoCoordinate)] = []
            for sportID in sportIDs {
                let home = jitter(GeoCoordinate(latitude: hub.latitude, longitude: hub.longitude), meters: 2_500, using: &rng)
                spots.append((sportID, home))
                // Sessions passées sur des jours distincts, dans le voisinage immédiat du spot.
                for day in Set((0..<Int.random(in: 2...5, using: &rng)).map { _ in Int.random(in: 1...25, using: &rng) }) {
                    let place = jitter(home, meters: 300, using: &rng)
                    let start = now.addingTimeInterval(-Double(day) * 86_400 - Double(Int.random(in: 0...40_000, using: &rng)))
                    history.append(ActivitySession(
                        userID: user.id, sportID: sportID,
                        geohash: Geohash.encode(latitude: place.latitude, longitude: place.longitude),
                        startedAt: start, endedAt: start.addingTimeInterval(Double(Int.random(in: 1_800...9_000, using: &rng)))
                    ))
                }
            }
            homes[user.id] = spots
        }

        await backend.seed(bots: bots, sessions: history)
        let simulator = DemoSimulator(backend: backend, bots: bots, homes: homes, rng: rng)
        await simulator.startInitialSessions(activeRatio: 0.35)
        return simulator
    }

    static func jitter(_ c: GeoCoordinate, meters: Double, using rng: inout SeededGenerator) -> GeoCoordinate {
        let dLat = Double.random(in: -meters...meters, using: &rng) / 111_000
        let dLon = Double.random(in: -meters...meters, using: &rng) / (111_000 * cos(c.latitude * .pi / 180))
        return GeoCoordinate(latitude: c.latitude + dLat, longitude: c.longitude + dLon)
    }

    static func uuid(_ rng: inout SeededGenerator) -> UUID {
        let a = rng.next(), b = rng.next()
        var bytes = [UInt8](repeating: 0, count: 16)
        for i in 0..<8 {
            bytes[i] = UInt8(truncatingIfNeeded: a >> (UInt64(i) * 8))
            bytes[8 + i] = UInt8(truncatingIfNeeded: b >> (UInt64(i) * 8))
        }
        return UUID(uuid: (bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
                           bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]))
    }
}

/// Fait vivre les utilisateurs de démo en passant par l'API publique du backend
/// (comme le ferait un vrai client) : la carte bouge, des sessions démarrent et s'arrêtent.
public actor DemoSimulator {
    private let backend: InMemoryBackend
    private let bots: [User]
    private let homes: [UUID: [(sportID: String, home: GeoCoordinate)]]
    private var rng: SeededGenerator
    private var current: [UUID: (sessionID: UUID, position: GeoCoordinate)] = [:]

    init(backend: InMemoryBackend, bots: [User], homes: [UUID: [(sportID: String, home: GeoCoordinate)]], rng: SeededGenerator) {
        self.backend = backend
        self.bots = bots
        self.homes = homes
        self.rng = rng
    }

    func startInitialSessions(activeRatio: Double) async {
        for bot in bots where Double.random(in: 0..<1, using: &rng) < activeRatio {
            await start(bot)
        }
    }

    /// À appeler périodiquement (toutes les quelques secondes).
    public func tick() async {
        for bot in bots {
            if let running = current[bot.id] {
                if Double.random(in: 0..<1, using: &rng) < 0.03 {
                    try? await backend.stopSession(sessionID: running.sessionID)
                    current[bot.id] = nil
                } else {
                    // Marche aléatoire de 30 à 150 m.
                    let next = DemoData.jitter(running.position, meters: 150, using: &rng)
                    try? await backend.updatePosition(sessionID: running.sessionID, latitude: next.latitude, longitude: next.longitude)
                    current[bot.id] = (running.sessionID, next)
                }
            } else if Double.random(in: 0..<1, using: &rng) < 0.02 {
                await start(bot)
            }
        }
    }

    /// Un lieu de pratique habituel d'un utilisateur de démo pour ce sport (sert aux outils de démo des Echos).
    public func spot(forSport sportID: String) -> GeoCoordinate? {
        for bot in bots {
            if let spot = homes[bot.id]?.first(where: { $0.sportID == sportID }) { return spot.home }
        }
        return nil
    }

    private func start(_ bot: User) async {
        guard let spot = homes[bot.id]?.randomElement(using: &rng) else { return }
        guard let session = try? await backend.startSession(userID: bot.id, sportID: spot.sportID) else { return }
        let position = DemoData.jitter(spot.home, meters: 300, using: &rng)
        try? await backend.updatePosition(sessionID: session.id, latitude: position.latitude, longitude: position.longitude)
        current[bot.id] = (session.id, position)
    }
}
