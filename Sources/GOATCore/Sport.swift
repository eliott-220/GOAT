import Foundation

public enum SportCategory: String, Codable, CaseIterable, Sendable {
    case glisse, course, velo, ballon, raquette, salle, nature, eau, combat, multi

    public var displayName: String {
        switch self {
        case .glisse: "Glisse"
        case .course: "Course & marche"
        case .velo: "Vélo"
        case .ballon: "Sports de balle"
        case .raquette: "Raquette"
        case .salle: "Salle & bien-être"
        case .nature: "Nature & plein air"
        case .eau: "Eau"
        case .combat: "Combat"
        case .multi: "Multisport"
        }
    }
}

public struct Sport: Identifiable, Hashable, Codable, Sendable {
    public let id: String
    public let name: String
    public let category: SportCategory
    /// Nom de SF Symbol.
    public let symbol: String

    public init(id: String, name: String, category: SportCategory, symbol: String) {
        self.id = id
        self.name = name
        self.category = category
        self.symbol = symbol
    }
}

/// Catalogue des sports : inspiré des activités des montres Garmin et COROS. Doit rester identique, ids, noms et catégories,
/// à web/src/core/sports.ts et à la table `sports` de supabase/migrations (les ids sont enregistrés en base : ne jamais en renommer un).
public enum SportCatalog {
    public static let all: [Sport] = [
        // Glisse
        Sport(id: "ski", name: "Ski", category: .glisse, symbol: "figure.skiing.downhill"),
        Sport(id: "snowboard", name: "Snowboard", category: .glisse, symbol: "figure.snowboarding"),
        Sport(id: "ski-fond", name: "Ski de fond", category: .glisse, symbol: "figure.skiing.crosscountry"),
        Sport(id: "ski-rando", name: "Ski de randonnée", category: .glisse, symbol: "figure.skiing.crosscountry"),
        Sport(id: "snowboard-rando", name: "Snowboard de randonnée", category: .glisse, symbol: "figure.snowboarding"),
        Sport(id: "raquettes", name: "Raquettes à neige", category: .glisse, symbol: "snowflake"),
        Sport(id: "patinage", name: "Patinage sur glace", category: .glisse, symbol: "figure.skating"),
        Sport(id: "roller", name: "Roller", category: .glisse, symbol: "figure.skating"),
        Sport(id: "skateboard", name: "Skateboard", category: .glisse, symbol: "figure.skating"),
        Sport(id: "surf", name: "Surf", category: .glisse, symbol: "figure.surfing"),
        Sport(id: "windsurf", name: "Planche à voile", category: .glisse, symbol: "wind"),
        Sport(id: "kitesurf", name: "Kitesurf", category: .glisse, symbol: "wind"),
        Sport(id: "speedsurf", name: "Speedsurf", category: .glisse, symbol: "wind"),
        Sport(id: "wakeboard", name: "Wakeboard", category: .glisse, symbol: "water.waves"),
        Sport(id: "wakesurf", name: "Wakesurf", category: .glisse, symbol: "water.waves"),
        Sport(id: "ski-nautique", name: "Ski nautique", category: .glisse, symbol: "water.waves"),
        // Course & marche
        Sport(id: "running", name: "Course à pied", category: .course, symbol: "figure.run"),
        Sport(id: "trail", name: "Trail", category: .course, symbol: "mountain.2.fill"),
        Sport(id: "piste", name: "Course sur piste", category: .course, symbol: "figure.track.and.field"),
        Sport(id: "tapis", name: "Tapis de course", category: .course, symbol: "figure.run.treadmill"),
        Sport(id: "obstacles", name: "Course d'obstacles", category: .course, symbol: "figure.run"),
        Sport(id: "marche", name: "Marche", category: .course, symbol: "figure.walk"),
        Sport(id: "marche-lestee", name: "Marche lestée", category: .course, symbol: "figure.walk"),
        // Vélo
        Sport(id: "velo", name: "Vélo", category: .velo, symbol: "figure.outdoor.cycle"),
        Sport(id: "vtt", name: "VTT", category: .velo, symbol: "figure.outdoor.cycle"),
        Sport(id: "gravel", name: "Gravel", category: .velo, symbol: "bicycle"),
        Sport(id: "cyclocross", name: "Cyclo-cross", category: .velo, symbol: "figure.outdoor.cycle"),
        Sport(id: "velo-electrique", name: "Vélo électrique", category: .velo, symbol: "bicycle"),
        Sport(id: "vtt-electrique", name: "VTT électrique", category: .velo, symbol: "bicycle"),
        Sport(id: "bmx", name: "BMX", category: .velo, symbol: "bicycle"),
        Sport(id: "velo-salle", name: "Vélo d'appartement", category: .velo, symbol: "figure.indoor.cycle"),
        Sport(id: "cyclotourisme", name: "Cyclotourisme", category: .velo, symbol: "map"),
        Sport(id: "velotaf", name: "Vélotaf", category: .velo, symbol: "building.2"),
        // Sports de balle
        Sport(id: "football", name: "Football", category: .ballon, symbol: "soccerball"),
        Sport(id: "futsal", name: "Futsal", category: .ballon, symbol: "soccerball"),
        Sport(id: "basket", name: "Basket", category: .ballon, symbol: "basketball"),
        Sport(id: "volleyball", name: "Volley-ball", category: .ballon, symbol: "volleyball"),
        Sport(id: "beach-volley", name: "Beach-volley", category: .ballon, symbol: "volleyball"),
        Sport(id: "handball", name: "Handball", category: .ballon, symbol: "figure.handball"),
        Sport(id: "rugby", name: "Rugby", category: .ballon, symbol: "rugbyball"),
        Sport(id: "football-americain", name: "Football américain", category: .ballon, symbol: "football"),
        Sport(id: "baseball", name: "Baseball", category: .ballon, symbol: "baseball"),
        Sport(id: "softball", name: "Softball", category: .ballon, symbol: "baseball"),
        Sport(id: "cricket", name: "Cricket", category: .ballon, symbol: "cricket.ball"),
        Sport(id: "hockey-gazon", name: "Hockey sur gazon", category: .ballon, symbol: "figure.hockey"),
        Sport(id: "hockey-glace", name: "Hockey sur glace", category: .ballon, symbol: "figure.hockey"),
        Sport(id: "lacrosse", name: "Crosse (lacrosse)", category: .ballon, symbol: "figure.lacrosse"),
        Sport(id: "ultimate", name: "Ultimate", category: .ballon, symbol: "figure.disc.sports"),
        // Raquette
        Sport(id: "tennis", name: "Tennis", category: .raquette, symbol: "tennis.racket"),
        Sport(id: "padel", name: "Padel", category: .raquette, symbol: "tennis.racket"),
        Sport(id: "pickleball", name: "Pickleball", category: .raquette, symbol: "figure.pickleball"),
        Sport(id: "badminton", name: "Badminton", category: .raquette, symbol: "figure.badminton"),
        Sport(id: "squash", name: "Squash", category: .raquette, symbol: "figure.squash"),
        Sport(id: "tennis-de-table", name: "Tennis de table", category: .raquette, symbol: "figure.table.tennis"),
        Sport(id: "racquetball", name: "Racquetball", category: .raquette, symbol: "figure.racquetball"),
        // Salle & bien-être
        Sport(id: "musculation", name: "Musculation", category: .salle, symbol: "figure.strengthtraining.traditional"),
        Sport(id: "crossfit", name: "CrossFit", category: .salle, symbol: "figure.cross.training"),
        Sport(id: "hiit", name: "HIIT", category: .salle, symbol: "figure.highintensity.intervaltraining"),
        Sport(id: "cardio", name: "Cardio training", category: .salle, symbol: "figure.mixed.cardio"),
        Sport(id: "elliptique", name: "Vélo elliptique", category: .salle, symbol: "figure.elliptical"),
        Sport(id: "stepper", name: "Stepper", category: .salle, symbol: "figure.stair.stepper"),
        Sport(id: "escaliers", name: "Montée d'escaliers", category: .salle, symbol: "figure.stairs"),
        Sport(id: "corde", name: "Corde à sauter", category: .salle, symbol: "figure.jumprope"),
        Sport(id: "yoga", name: "Yoga", category: .salle, symbol: "figure.yoga"),
        Sport(id: "pilates", name: "Pilates", category: .salle, symbol: "figure.pilates"),
        Sport(id: "mobilite", name: "Mobilité & étirements", category: .salle, symbol: "figure.flexibility"),
        Sport(id: "respiration", name: "Respiration (breathwork)", category: .salle, symbol: "wind"),
        Sport(id: "meditation", name: "Méditation", category: .salle, symbol: "figure.mind.and.body"),
        Sport(id: "danse", name: "Danse", category: .salle, symbol: "figure.dance"),
        Sport(id: "gymnastique", name: "Gymnastique", category: .salle, symbol: "figure.gymnastics"),
        // Nature & plein air
        Sport(id: "randonnee", name: "Randonnée", category: .nature, symbol: "figure.hiking"),
        Sport(id: "alpinisme", name: "Alpinisme", category: .nature, symbol: "mountain.2"),
        Sport(id: "escalade", name: "Escalade", category: .nature, symbol: "figure.climbing"),
        Sport(id: "bloc", name: "Bloc", category: .nature, symbol: "figure.climbing"),
        Sport(id: "escalade-salle", name: "Escalade en salle", category: .nature, symbol: "figure.climbing"),
        Sport(id: "equitation", name: "Équitation", category: .nature, symbol: "figure.equestrian.sports"),
        Sport(id: "golf", name: "Golf", category: .nature, symbol: "figure.golf"),
        Sport(id: "disc-golf", name: "Disc golf", category: .nature, symbol: "figure.disc.sports"),
        Sport(id: "tir-arc", name: "Tir à l'arc", category: .nature, symbol: "figure.archery"),
        // Eau
        Sport(id: "natation", name: "Natation", category: .eau, symbol: "figure.pool.swim"),
        Sport(id: "eau-libre", name: "Natation en eau libre", category: .eau, symbol: "figure.open.water.swim"),
        Sport(id: "aviron", name: "Aviron", category: .eau, symbol: "figure.rower"),
        Sport(id: "aviron-salle", name: "Aviron en salle", category: .eau, symbol: "figure.rower"),
        Sport(id: "kayak", name: "Kayak & canoë", category: .eau, symbol: "oar.2.crossed"),
        Sport(id: "eau-vive", name: "Eau vive", category: .eau, symbol: "oar.2.crossed"),
        Sport(id: "paddle", name: "Paddle", category: .eau, symbol: "oar.2.crossed"),
        Sport(id: "voile", name: "Voile", category: .eau, symbol: "sailboat"),
        Sport(id: "plongee", name: "Plongée", category: .eau, symbol: "water.waves"),
        Sport(id: "apnee", name: "Apnée", category: .eau, symbol: "drop"),
        Sport(id: "snorkeling", name: "Snorkeling", category: .eau, symbol: "water.waves"),
        Sport(id: "water-polo", name: "Water-polo", category: .eau, symbol: "figure.waterpolo"),
        // Combat
        Sport(id: "boxe", name: "Boxe", category: .combat, symbol: "figure.boxing"),
        Sport(id: "mma", name: "MMA", category: .combat, symbol: "figure.martial.arts"),
        Sport(id: "judo", name: "Judo", category: .combat, symbol: "figure.martial.arts"),
        Sport(id: "karate", name: "Karaté", category: .combat, symbol: "figure.martial.arts"),
        Sport(id: "taekwondo", name: "Taekwondo", category: .combat, symbol: "figure.martial.arts"),
        Sport(id: "jiu-jitsu", name: "Jiu-jitsu", category: .combat, symbol: "figure.martial.arts"),
        Sport(id: "lutte", name: "Lutte", category: .combat, symbol: "figure.wrestling"),
        Sport(id: "escrime", name: "Escrime", category: .combat, symbol: "figure.fencing"),
        // Multisport
        Sport(id: "triathlon", name: "Triathlon", category: .multi, symbol: "figure.pool.swim"),
        Sport(id: "duathlon", name: "Duathlon", category: .multi, symbol: "figure.run"),
        Sport(id: "swimrun", name: "Swimrun", category: .multi, symbol: "figure.open.water.swim"),
        Sport(id: "course-aventure", name: "Course d'aventure", category: .multi, symbol: "safari"),
        Sport(id: "multisport", name: "Multisport", category: .multi, symbol: "figure.mixed.cardio"),
    ]

    private static let byID: [String: Sport] = Dictionary(uniqueKeysWithValues: all.map { ($0.id, $0) })

    public static func sport(id: String) -> Sport? { byID[id] }
}
