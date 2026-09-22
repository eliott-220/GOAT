import Foundation

// MARK: - Utilisateur

public enum VisibilityScope: String, Codable, CaseIterable, Sendable {
    case everyone, mySports, myAlliances

    public var displayName: String {
        switch self {
        case .everyone: "Tout le monde"
        case .mySports: "Les pratiquants de mes sports"
        case .myAlliances: "Mes Alliances uniquement"
        }
    }
}

public struct VisibilitySettings: Codable, Hashable, Sendable {
    public var scope: VisibilityScope
    /// Bascule "invisible", utilisable à tout moment, y compris en session active.
    public var isInvisible: Bool
    /// Délai pendant lequel on reste visible ("récemment actif") après la fin d'une session.
    public var lingerMinutes: Int

    public static let lingerOptions = [0, 5, 15, 30]
    public static let `default` = VisibilitySettings(scope: .everyone, isInvisible: false, lingerMinutes: 15)

    public init(scope: VisibilityScope, isInvisible: Bool, lingerMinutes: Int) {
        self.scope = scope
        self.isInvisible = isInvisible
        self.lingerMinutes = lingerMinutes
    }
}

public struct UserSport: Codable, Hashable, Sendable {
    public var sportID: String
    public var isPrimary: Bool

    public init(sportID: String, isPrimary: Bool = false) {
        self.sportID = sportID
        self.isPrimary = isPrimary
    }
}

public struct User: Identifiable, Codable, Hashable, Sendable {
    public var id: UUID
    public var firstName: String
    public var bio: String
    /// Photo de profil (JPEG). Stockée localement au MVP ; deviendra une URL avec un vrai backend.
    public var photoData: Data?
    public var sports: [UserSport]
    public var visibility: VisibilitySettings
    public var joinedAt: Date

    public init(
        id: UUID = UUID(),
        firstName: String,
        bio: String = "",
        photoData: Data? = nil,
        sports: [UserSport] = [],
        visibility: VisibilitySettings = .default,
        joinedAt: Date = Date()
    ) {
        self.id = id
        self.firstName = firstName
        self.bio = bio
        self.photoData = photoData
        self.sports = sports
        self.visibility = visibility
        self.joinedAt = joinedAt
    }

    public var sportIDs: [String] { sports.map(\.sportID) }
    public var primarySportID: String? { sports.first(where: \.isPrimary)?.sportID ?? sports.first?.sportID }
    public func practices(_ sportID: String) -> Bool { sports.contains { $0.sportID == sportID } }
}

// MARK: - Session de pratique

public enum SessionStatus: String, Codable, Sendable {
    case active, recentlyActive, finished
}

public struct ActivitySession: Identifiable, Codable, Hashable, Sendable {
    public var id: UUID
    public var userID: UUID
    public var sportID: String
    /// Position arrondie (geohash). Aucune coordonnée exacte n'est jamais stockée ni diffusée.
    public var geohash: String?
    public var startedAt: Date
    public var endedAt: Date?

    public init(
        id: UUID = UUID(), userID: UUID, sportID: String,
        geohash: String? = nil, startedAt: Date, endedAt: Date? = nil
    ) {
        self.id = id
        self.userID = userID
        self.sportID = sportID
        self.geohash = geohash
        self.startedAt = startedAt
        self.endedAt = endedAt
    }

    /// Actif pendant la session → "récemment actif" pendant `lingerMinutes` après l'arrêt → terminé.
    public func status(at now: Date, lingerMinutes: Int) -> SessionStatus {
        guard let endedAt else { return .active }
        return now.timeIntervalSince(endedAt) < Double(lingerMinutes) * 60 ? .recentlyActive : .finished
    }

    public func duration(at now: Date) -> TimeInterval {
        (endedAt ?? now).timeIntervalSince(startedAt)
    }
}

// MARK: - Social

public enum AllianceStatus: String, Codable, Sendable {
    case pending, accepted
}

public struct Alliance: Identifiable, Codable, Hashable, Sendable {
    public var id: UUID
    /// Demandeur.
    public var userA: UUID
    /// Destinataire : seul lui peut accepter.
    public var userB: UUID
    public var status: AllianceStatus

    public init(id: UUID = UUID(), userA: UUID, userB: UUID, status: AllianceStatus = .pending) {
        self.id = id
        self.userA = userA
        self.userB = userB
        self.status = status
    }

    public func involves(_ userID: UUID) -> Bool { userA == userID || userB == userID }
    public func other(than userID: UUID) -> UUID { userA == userID ? userB : userA }
}

public struct Tribu: Identifiable, Codable, Hashable, Sendable {
    public var id: UUID
    public var name: String
    public var creatorID: UUID
    public var memberIDs: [UUID]

    public init(id: UUID = UUID(), name: String, creatorID: UUID, memberIDs: [UUID]? = nil) {
        self.id = id
        self.name = name
        self.creatorID = creatorID
        self.memberIDs = memberIDs ?? [creatorID]
    }
}

/// Suggestion générée automatiquement à partir de la pratique commune. Ne connecte personne d'elle-même.
public struct Echo: Identifiable, Hashable, Sendable {
    public var id: String
    public var userA: UUID
    public var userB: UUID
    /// Calculé côté backend ; jamais exposé aux clients (voir `EchoSuggestion`).
    public var proximityScore: Double
    public var commonSportID: String
}

public struct Block: Hashable, Codable, Sendable {
    public var blocker: UUID
    public var blocked: UUID

    public init(blocker: UUID, blocked: UUID) {
        self.blocker = blocker
        self.blocked = blocked
    }
}

public struct Report: Identifiable, Codable, Hashable, Sendable {
    public var id: UUID
    public var reporterID: UUID
    public var reportedID: UUID
    public var reason: String
    public var createdAt: Date

    public init(id: UUID = UUID(), reporterID: UUID, reportedID: UUID, reason: String, createdAt: Date) {
        self.id = id
        self.reporterID = reporterID
        self.reportedID = reportedID
        self.reason = reason
        self.createdAt = createdAt
    }
}

/// Paire non ordonnée d'utilisateurs.
public struct UserPair: Hashable, Sendable {
    public let first: UUID
    public let second: UUID

    public init(_ a: UUID, _ b: UUID) {
        if a.uuidString <= b.uuidString { first = a; second = b } else { first = b; second = a }
    }
}

// MARK: - Vues côté client (ce que le backend diffuse)

/// Un pin par utilisateur visible. Ne porte que la position arrondie (centre de cellule geohash).
public struct PresencePin: Identifiable, Hashable, Sendable {
    public var id: UUID { userID }
    public var userID: UUID
    public var firstName: String
    public var sportIDs: [String]
    public var coordinate: GeoCoordinate
    public var status: SessionStatus
    public var isMe: Bool
    /// Faux pour mon propre pin quand je suis invisible aux autres.
    public var isVisibleToOthers: Bool
}

public enum AllianceRelation: Hashable, Sendable {
    case none
    case requestSent(UUID)
    case requestReceived(UUID)
    case allied
}

/// Mini-profil affiché au tap sur un pin : jamais de position.
public struct MiniProfile: Identifiable, Hashable, Sendable {
    public var id: UUID
    public var firstName: String
    public var bio: String
    public var photoData: Data?
    public var memberSince: Date
    public var sportIDs: [String]
    public var currentSportIDs: [String]
    public var relation: AllianceRelation
}

public struct AllianceEntry: Identifiable, Hashable, Sendable {
    public var id: UUID { alliance.id }
    public var alliance: Alliance
    public var other: User
}

public struct AllianceOverview: Hashable, Sendable {
    public var allies: [AllianceEntry]
    public var incoming: [AllianceEntry]
    public var outgoing: [AllianceEntry]

    public static let empty = AllianceOverview(allies: [], incoming: [], outgoing: [])
}

public struct TribuOverview: Hashable, Sendable {
    public var mine: [Tribu]
    public var discover: [Tribu]

    public static let empty = TribuOverview(mine: [], discover: [])
}

public struct EchoSuggestion: Identifiable, Hashable, Sendable {
    public var id: String
    public var user: User
    public var sportID: String
}

// MARK: - Sélection de sports

public extension Array where Element == UserSport {
    /// Ajoute ou retire un sport. Garde toujours exactement un sport "principal" tant que la liste n'est pas vide.
    mutating func toggle(_ sportID: String) {
        if let index = firstIndex(where: { $0.sportID == sportID }) {
            let wasPrimary = self[index].isPrimary
            remove(at: index)
            if wasPrimary, !isEmpty { self[0].isPrimary = true }
        } else {
            append(UserSport(sportID: sportID, isPrimary: isEmpty))
        }
    }

    mutating func makePrimary(_ sportID: String) {
        guard contains(where: { $0.sportID == sportID }) else { return }
        for index in indices { self[index].isPrimary = self[index].sportID == sportID }
    }
}
