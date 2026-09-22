import Foundation

/// Relations sociales nécessaires aux règles de visibilité.
public struct SocialGraph: Sendable {
    public var alliances: [Alliance]
    public var blocks: Set<Block>

    public init(alliances: [Alliance] = [], blocks: Set<Block> = []) {
        self.alliances = alliances
        self.blocks = blocks
    }

    /// Un blocage dans un sens ou dans l'autre fait disparaître les deux profils l'un pour l'autre.
    public func isBlocked(_ a: UUID, _ b: UUID) -> Bool {
        blocks.contains(Block(blocker: a, blocked: b)) || blocks.contains(Block(blocker: b, blocked: a))
    }

    public func areAllies(_ a: UUID, _ b: UUID) -> Bool {
        alliances.contains { $0.status == .accepted && $0.involves(a) && $0.involves(b) }
    }

    public func alliance(between a: UUID, _ b: UUID) -> Alliance? {
        alliances.first { $0.involves(a) && $0.involves(b) }
    }
}

public enum VisibilityPolicy {
    /// Est-ce que `viewer` a le droit de voir la session de `target` sur la carte ?
    public static func canSee(
        viewer: User, target: User, session: ActivitySession,
        graph: SocialGraph, now: Date
    ) -> Bool {
        // Cycle de vie de la session : valable aussi pour mon propre pin (il disparaît après le délai).
        guard session.geohash != nil else { return false }
        guard session.status(at: now, lingerMinutes: target.visibility.lingerMinutes) != .finished else { return false }
        // Je me vois toujours moi-même (grisé si je suis invisible) ; les autres réglages s'appliquent aux autres.
        if viewer.id == target.id { return true }
        guard !graph.isBlocked(viewer.id, target.id) else { return false }
        guard !target.visibility.isInvisible else { return false }

        switch target.visibility.scope {
        case .everyone: return true
        case .mySports: return viewer.practices(session.sportID)
        case .myAlliances: return graph.areAllies(viewer.id, target.id)
        }
    }

    /// Un Echo propose un profil à un inconnu : on respecte le réglage de visibilité de la personne suggérée.
    public static func canSuggest(target: User, to viewer: User, graph: SocialGraph) -> Bool {
        guard !graph.isBlocked(viewer.id, target.id) else { return false }
        return target.visibility.scope != .myAlliances
    }
}

/// Génération automatique des Echos : deux utilisateurs partageant un sport ET une zone de pratique récurrente.
public struct EchoEngine: Sendable {
    /// Nombre de jours distincts de pratique dans la zone pour la considérer "récurrente".
    public var minDistinctDays = 2
    /// Précision du geohash définissant une zone (5 ≈ 5 km).
    public var zonePrecision = 5
    /// Fenêtre d'historique prise en compte.
    public var windowDays = 60
    /// Poids cumulé à partir duquel le score plafonne à 1.
    public var scoreSaturation = 8

    public init() {}

    public func generate(sessions: [ActivitySession], excluding excluded: Set<UserPair>, now: Date) -> [Echo] {
        struct Zone: Hashable { var sportID: String; var zone: String }
        struct PairSport: Hashable { var pair: UserPair; var sportID: String }

        let cutoff = now.addingTimeInterval(-Double(windowDays) * 86_400)
        var daysByZone: [Zone: [UUID: Set<Int>]] = [:]
        for session in sessions where session.startedAt >= cutoff {
            guard let hash = session.geohash, hash.count >= zonePrecision else { continue }
            let day = Int(session.startedAt.timeIntervalSince1970 / 86_400)
            daysByZone[Zone(sportID: session.sportID, zone: String(hash.prefix(zonePrecision))), default: [:]][session.userID, default: []].insert(day)
        }

        var weights: [PairSport: Int] = [:]
        for (zone, perUser) in daysByZone {
            let regulars = perUser.filter { $0.value.count >= minDistinctDays }.sorted { $0.key.uuidString < $1.key.uuidString }
            for i in regulars.indices {
                for j in regulars.indices where j > i {
                    let pair = UserPair(regulars[i].key, regulars[j].key)
                    guard !excluded.contains(pair) else { continue }
                    weights[PairSport(pair: pair, sportID: zone.sportID), default: 0] += min(regulars[i].value.count, regulars[j].value.count)
                }
            }
        }

        return weights
            .map { key, weight in
                Echo(
                    id: "\(key.pair.first.uuidString)|\(key.pair.second.uuidString)|\(key.sportID)",
                    userA: key.pair.first, userB: key.pair.second,
                    proximityScore: min(1, Double(weight) / Double(scoreSaturation)),
                    commonSportID: key.sportID
                )
            }
            .sorted { $0.proximityScore != $1.proximityScore ? $0.proximityScore > $1.proximityScore : $0.id < $1.id }
    }
}
