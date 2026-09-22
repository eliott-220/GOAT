import Foundation

/// Backend en mémoire : applique toutes les règles métier de la spec, sans réseau.
/// Sert au développement, aux tests et à la démo tant que le vrai backend n'est pas branché.
public actor InMemoryBackend: PresenceBackend {
    private var users: [UUID: User] = [:]
    private var sessions: [UUID: ActivitySession] = [:]
    private var alliances: [UUID: Alliance] = [:]
    private var tribus: [UUID: Tribu] = [:]
    private var blocks: Set<Block> = []
    private var reports: [Report] = []

    private let now: @Sendable () -> Date
    private let echoEngine: EchoEngine

    // Comportement de démo
    private var botIDs: Set<UUID> = []
    private let botReplyDelay: Duration?
    private let welcomeRequestCount: Int

    /// - Parameters:
    ///   - botReplyDelay: si non nil, les utilisateurs de démo acceptent les demandes d'Alliance après ce délai.
    ///   - welcomeRequestCount: nombre de demandes d'Alliance de démo reçues par un nouvel utilisateur.
    public init(
        now: @escaping @Sendable () -> Date = { Date() },
        echoEngine: EchoEngine = EchoEngine(),
        botReplyDelay: Duration? = nil,
        welcomeRequestCount: Int = 0
    ) {
        self.now = now
        self.echoEngine = echoEngine
        self.botReplyDelay = botReplyDelay
        self.welcomeRequestCount = welcomeRequestCount
    }

    // MARK: Seed (démo / tests)

    public func seed(bots: [User], sessions seeded: [ActivitySession]) {
        for bot in bots {
            users[bot.id] = bot
            botIDs.insert(bot.id)
        }
        for session in seeded { sessions[session.id] = session }
    }

    /// Ajoute `days` sessions passées (jours distincts) au même endroit, pour que les Echos puissent apparaître.
    public func backfillHistory(userID: UUID, sportID: String, geohash: String, days: Int) {
        let base = now()
        for day in 1...max(1, days) {
            let start = base.addingTimeInterval(-Double(day) * 86_400 - 3_600)
            let session = ActivitySession(
                userID: userID, sportID: sportID, geohash: geohash,
                startedAt: start, endedAt: start.addingTimeInterval(3_600)
            )
            sessions[session.id] = session
        }
    }

    // MARK: Utilisateurs

    public func upsert(user: User) {
        let isNew = users[user.id] == nil
        users[user.id] = user
        if isNew, botReplyDelay != nil, welcomeRequestCount > 0 {
            for botID in botIDs.sorted(by: { $0.uuidString < $1.uuidString }).prefix(welcomeRequestCount) {
                let alliance = Alliance(userA: botID, userB: user.id)
                alliances[alliance.id] = alliance
            }
        }
    }

    public func user(id: UUID) -> User? { users[id] }

    public func profile(of targetID: UUID, viewedBy viewerID: UUID) -> MiniProfile? {
        guard let target = users[targetID], !graph().isBlocked(viewerID, targetID) else { return nil }
        let current = sessions.values
            .filter { $0.userID == targetID && $0.status(at: now(), lingerMinutes: target.visibility.lingerMinutes) == .active }
            .map(\.sportID)

        let relation: AllianceRelation
        if let alliance = graph().alliance(between: viewerID, targetID) {
            switch (alliance.status, alliance.userA == viewerID) {
            case (.accepted, _): relation = .allied
            case (.pending, true): relation = .requestSent(alliance.id)
            case (.pending, false): relation = .requestReceived(alliance.id)
            }
        } else {
            relation = .none
        }

        return MiniProfile(
            id: target.id, firstName: target.firstName, bio: target.bio, photoData: target.photoData,
            memberSince: target.joinedAt, sportIDs: target.sportIDs, currentSportIDs: current, relation: relation
        )
    }

    // MARK: Sessions

    public func startSession(userID: UUID, sportID: String) throws -> ActivitySession {
        guard let user = users[userID] else { throw BackendError.userNotFound }
        guard SportCatalog.sport(id: sportID) != nil else { throw BackendError.invalid("Sport inconnu.") }
        guard user.practices(sportID) else { throw BackendError.invalid("Ce sport n'est pas dans ton profil.") }
        if let existing = sessions.values.first(where: { $0.userID == userID && $0.sportID == sportID && $0.endedAt == nil }) {
            return existing
        }
        let session = ActivitySession(userID: userID, sportID: sportID, startedAt: now())
        sessions[session.id] = session
        return session
    }

    /// Arrondi côté serveur : la coordonnée brute n'est jamais conservée.
    public func updatePosition(sessionID: UUID, latitude: Double, longitude: Double) throws {
        guard var session = sessions[sessionID] else { throw BackendError.sessionNotFound }
        guard session.endedAt == nil else { throw BackendError.notAllowed }
        session.geohash = Geohash.encode(latitude: latitude, longitude: longitude)
        sessions[sessionID] = session
    }

    public func stopSession(sessionID: UUID) throws {
        guard var session = sessions[sessionID] else { throw BackendError.sessionNotFound }
        if session.endedAt == nil {
            session.endedAt = now()
            sessions[sessionID] = session
        }
    }

    public func activeSessions(userID: UUID) -> [ActivitySession] {
        sessions.values.filter { $0.userID == userID && $0.endedAt == nil }.sorted { $0.startedAt < $1.startedAt }
    }

    public func history(userID: UUID) -> [ActivitySession] {
        sessions.values.filter { $0.userID == userID && $0.endedAt != nil }.sorted { $0.startedAt > $1.startedAt }
    }

    public func pins(for viewerID: UUID) -> [PresencePin] {
        guard let viewer = users[viewerID] else { return [] }
        let graph = graph()
        let date = now()

        var visible: [UUID: [ActivitySession]] = [:]
        for session in sessions.values {
            guard let target = users[session.userID],
                  VisibilityPolicy.canSee(viewer: viewer, target: target, session: session, graph: graph, now: date)
            else { continue }
            visible[target.id, default: []].append(session)
        }

        return visible.compactMap { userID, userSessions in
            guard let user = users[userID],
                  let latest = userSessions.max(by: { $0.startedAt < $1.startedAt }),
                  let hash = latest.geohash, let coordinate = Geohash.decode(hash)
            else { return nil }
            let linger = user.visibility.lingerMinutes
            let isActive = userSessions.contains { $0.status(at: date, lingerMinutes: linger) == .active }
            // Un sport n'apparaît qu'une fois (session récente + nouvelle session du même sport), du plus récent au plus ancien.
            var seenSports = Set<String>()
            let sportIDs = userSessions.sorted { $0.startedAt > $1.startedAt }.map(\.sportID).filter { seenSports.insert($0).inserted }
            return PresencePin(
                userID: userID, firstName: user.firstName,
                sportIDs: sportIDs,
                coordinate: coordinate, status: isActive ? .active : .recentlyActive,
                isMe: userID == viewerID, isVisibleToOthers: !user.visibility.isInvisible
            )
        }
        .sorted { $0.userID.uuidString < $1.userID.uuidString }
    }

    // MARK: Alliances & tribus

    public func allianceOverview(for userID: UUID) -> AllianceOverview {
        let graph = graph()
        var overview = AllianceOverview.empty
        for alliance in alliances.values where alliance.involves(userID) {
            let otherID = alliance.other(than: userID)
            guard let other = users[otherID], !graph.isBlocked(userID, otherID) else { continue }
            let entry = AllianceEntry(alliance: alliance, other: other)
            switch (alliance.status, alliance.userA == userID) {
            case (.accepted, _): overview.allies.append(entry)
            case (.pending, true): overview.outgoing.append(entry)
            case (.pending, false): overview.incoming.append(entry)
            }
        }
        let byName: (AllianceEntry, AllianceEntry) -> Bool = { $0.other.firstName < $1.other.firstName }
        overview.allies.sort(by: byName)
        overview.incoming.sort(by: byName)
        overview.outgoing.sort(by: byName)
        return overview
    }

    public func requestAlliance(from requesterID: UUID, to targetID: UUID) throws -> Alliance {
        guard requesterID != targetID else { throw BackendError.invalid("Tu ne peux pas t'ajouter toi-même.") }
        guard users[requesterID] != nil, users[targetID] != nil else { throw BackendError.userNotFound }
        guard !graph().isBlocked(requesterID, targetID) else { throw BackendError.notAllowed }
        guard graph().alliance(between: requesterID, targetID) == nil else { throw BackendError.alreadyExists }

        let alliance = Alliance(userA: requesterID, userB: targetID)
        alliances[alliance.id] = alliance

        if let delay = botReplyDelay, botIDs.contains(targetID) {
            let id = alliance.id
            Task { [weak self] in
                try? await Task.sleep(for: delay)
                await self?.botAccepts(allianceID: id)
            }
        }
        return alliance
    }

    private func botAccepts(allianceID: UUID) {
        guard var alliance = alliances[allianceID], alliance.status == .pending else { return }
        alliance.status = .accepted
        alliances[allianceID] = alliance
    }

    public func respondToAlliance(id: UUID, by userID: UUID, accept: Bool) throws {
        guard var alliance = alliances[id] else { throw BackendError.allianceNotFound }
        // Jamais unilatérale : seul le destinataire d'une demande en attente peut répondre.
        guard alliance.userB == userID, alliance.status == .pending else { throw BackendError.notAllowed }
        if accept {
            alliance.status = .accepted
            alliances[id] = alliance
        } else {
            alliances[id] = nil
        }
    }

    public func tribus(for userID: UUID) -> TribuOverview {
        let all = tribus.values.sorted { $0.name < $1.name }
        return TribuOverview(
            mine: all.filter { $0.memberIDs.contains(userID) },
            discover: all.filter { !$0.memberIDs.contains(userID) }
        )
    }

    public func createTribu(name: String, creatorID: UUID) throws -> Tribu {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw BackendError.invalid("Donne un nom à ta tribu.") }
        guard users[creatorID] != nil else { throw BackendError.userNotFound }
        let tribu = Tribu(name: trimmed, creatorID: creatorID)
        tribus[tribu.id] = tribu
        return tribu
    }

    public func joinTribu(id: UUID, userID: UUID) throws {
        guard var tribu = tribus[id] else { throw BackendError.tribuNotFound }
        guard users[userID] != nil else { throw BackendError.userNotFound }
        if !tribu.memberIDs.contains(userID) {
            tribu.memberIDs.append(userID)
            tribus[id] = tribu
        }
    }

    public func leaveTribu(id: UUID, userID: UUID) throws {
        guard var tribu = tribus[id] else { throw BackendError.tribuNotFound }
        tribu.memberIDs.removeAll { $0 == userID }
        tribus[id] = tribu.memberIDs.isEmpty ? nil : tribu
    }

    // MARK: Echos

    public func echoes(for userID: UUID) -> [EchoSuggestion] {
        guard let viewer = users[userID] else { return [] }
        let graph = graph()
        // Pas d'Echo pour une paire déjà liée (demande en cours ou Alliance) ou bloquée.
        var excluded = Set(alliances.values.map { UserPair($0.userA, $0.userB) })
        excluded.formUnion(blocks.map { UserPair($0.blocker, $0.blocked) })

        return echoEngine.generate(sessions: Array(sessions.values), excluding: excluded, now: now())
            .compactMap { echo in
                guard echo.userA == userID || echo.userB == userID else { return nil }
                let otherID = echo.userA == userID ? echo.userB : echo.userA
                guard let other = users[otherID],
                      VisibilityPolicy.canSuggest(target: other, to: viewer, graph: graph)
                else { return nil }
                return EchoSuggestion(id: echo.id, user: other, sportID: echo.commonSportID)
            }
    }

    // MARK: Modération

    public func block(_ blockedID: UUID, by blockerID: UUID) throws {
        guard blockerID != blockedID else { throw BackendError.invalid("Tu ne peux pas te bloquer toi-même.") }
        guard users[blockedID] != nil else { throw BackendError.userNotFound }
        blocks.insert(Block(blocker: blockerID, blocked: blockedID))
        // Un blocage rompt aussi toute Alliance ou demande en cours.
        for (id, alliance) in alliances where alliance.involves(blockerID) && alliance.involves(blockedID) {
            alliances[id] = nil
        }
    }

    public func unblock(_ blockedID: UUID, by blockerID: UUID) {
        blocks.remove(Block(blocker: blockerID, blocked: blockedID))
    }

    public func blockedUsers(of userID: UUID) -> [User] {
        blocks.filter { $0.blocker == userID }.compactMap { users[$0.blocked] }.sorted { $0.firstName < $1.firstName }
    }

    public func report(_ reportedID: UUID, by reporterID: UUID, reason: String) throws {
        guard users[reportedID] != nil else { throw BackendError.userNotFound }
        reports.append(Report(reporterID: reporterID, reportedID: reportedID, reason: reason, createdAt: now()))
    }

    public var reportCount: Int { reports.count }

    private func graph() -> SocialGraph {
        SocialGraph(alliances: Array(alliances.values), blocks: blocks)
    }
}
