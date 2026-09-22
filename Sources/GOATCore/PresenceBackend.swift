import Foundation

public enum BackendError: Error, Equatable, LocalizedError {
    case userNotFound
    case sessionNotFound
    case allianceNotFound
    case tribuNotFound
    case notAllowed
    case alreadyExists
    case invalid(String)

    public var errorDescription: String? {
        switch self {
        case .userNotFound: "Utilisateur introuvable."
        case .sessionNotFound: "Session introuvable."
        case .allianceNotFound: "Demande d'Alliance introuvable."
        case .tribuNotFound: "Tribu introuvable."
        case .notAllowed: "Action non autorisée."
        case .alreadyExists: "Cette demande existe déjà."
        case .invalid(let message): message
        }
    }
}

/// Contrat entre l'app et le backend temps réel (Supabase Realtime ou Firebase, à trancher).
///
/// Règles que toute implémentation doit garantir :
/// - la position reçue par `updatePosition` est arrondie **côté serveur** ; seul le geohash est stocké/diffusé ;
/// - `pins`, `profile` et `echoes` n'exposent rien d'un utilisateur bloqué (dans les deux sens) ;
/// - une Alliance exige demande + acceptation par le destinataire.
public protocol PresenceBackend: Sendable {
    // Utilisateurs
    func upsert(user: User) async
    func user(id: UUID) async -> User?
    func profile(of targetID: UUID, viewedBy viewerID: UUID) async -> MiniProfile?

    // Sessions
    /// Plusieurs sessions simultanées sont possibles, mais une seule par sport.
    func startSession(userID: UUID, sportID: String) async throws -> ActivitySession
    func updatePosition(sessionID: UUID, latitude: Double, longitude: Double) async throws
    func stopSession(sessionID: UUID) async throws
    func activeSessions(userID: UUID) async -> [ActivitySession]
    func history(userID: UUID) async -> [ActivitySession]
    func pins(for viewerID: UUID) async -> [PresencePin]

    // Alliances & tribus
    func allianceOverview(for userID: UUID) async -> AllianceOverview
    func requestAlliance(from requesterID: UUID, to targetID: UUID) async throws -> Alliance
    func respondToAlliance(id: UUID, by userID: UUID, accept: Bool) async throws
    func tribus(for userID: UUID) async -> TribuOverview
    func createTribu(name: String, creatorID: UUID) async throws -> Tribu
    func joinTribu(id: UUID, userID: UUID) async throws
    func leaveTribu(id: UUID, userID: UUID) async throws

    // Echos (lecture seule : ils sont générés automatiquement)
    func echoes(for userID: UUID) async -> [EchoSuggestion]

    // Modération
    func block(_ blockedID: UUID, by blockerID: UUID) async throws
    func unblock(_ blockedID: UUID, by blockerID: UUID) async
    func blockedUsers(of userID: UUID) async -> [User]
    func report(_ reportedID: UUID, by reporterID: UUID, reason: String) async throws
}
