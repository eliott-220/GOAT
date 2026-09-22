import Foundation
import Testing
@testable import GOATCore

@Suite struct BackendTests {
    private static let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    private func makeBackend() -> InMemoryBackend {
        InMemoryBackend(now: { Self.t0 })
    }

    private func register(_ backend: InMemoryBackend, _ name: String, sports: [String] = ["ski"],
                          scope: VisibilityScope = .everyone) async -> User {
        let user = User(firstName: name, sports: sports.map { UserSport(sportID: $0) },
                        visibility: VisibilitySettings(scope: scope, isInvisible: false, lingerMinutes: 15))
        await backend.upsert(user: user)
        return user
    }

    private func startWithPosition(_ backend: InMemoryBackend, _ user: User, sport: String = "ski") async throws {
        let session = try await backend.startSession(userID: user.id, sportID: sport)
        try await backend.updatePosition(sessionID: session.id, latitude: 45.9, longitude: 6.8)
    }

    // MARK: Sessions & position

    @Test func positionIsRoundedServerSide() async throws {
        let backend = makeBackend()
        let a = await register(backend, "A"), b = await register(backend, "B")
        let session = try await backend.startSession(userID: a.id, sportID: "ski")
        try await backend.updatePosition(sessionID: session.id, latitude: 45.923712, longitude: 6.869433)

        let pin = try #require(await backend.pins(for: b.id).first)
        let exact = GeoCoordinate(latitude: 45.923712, longitude: 6.869433)
        #expect(pin.coordinate != exact)
        #expect(pin.coordinate.distance(to: exact) < 150)

        let stored = await backend.activeSessions(userID: a.id).first
        #expect(stored?.geohash?.count == Geohash.publicPrecision)
    }

    @Test func sessionWithoutPositionShowsNoPin() async throws {
        let backend = makeBackend()
        let a = await register(backend, "A"), b = await register(backend, "B")
        _ = try await backend.startSession(userID: a.id, sportID: "ski")
        #expect(await backend.pins(for: b.id).isEmpty)
    }

    @Test func multipleSportsAtOnceButNotTwiceTheSame() async throws {
        let backend = makeBackend()
        let a = await register(backend, "A", sports: ["ski", "trail"])
        let ski = try await backend.startSession(userID: a.id, sportID: "ski")
        _ = try await backend.startSession(userID: a.id, sportID: "trail")
        let skiAgain = try await backend.startSession(userID: a.id, sportID: "ski")
        #expect(skiAgain.id == ski.id)
        #expect(await backend.activeSessions(userID: a.id).count == 2)
    }

    @Test func cannotStartSportOutsideProfile() async {
        let backend = makeBackend()
        let a = await register(backend, "A", sports: ["ski"])
        await #expect(throws: BackendError.invalid("Ce sport n'est pas dans ton profil.")) {
            _ = try await backend.startSession(userID: a.id, sportID: "surf")
        }
    }

    @Test func onePinPerUserEvenWithSeveralSessions() async throws {
        let backend = makeBackend()
        let a = await register(backend, "A", sports: ["ski", "trail"]), b = await register(backend, "B")
        try await startWithPosition(backend, a, sport: "ski")
        try await startWithPosition(backend, a, sport: "trail")
        let pins = await backend.pins(for: b.id)
        #expect(pins.count == 1)
        #expect(Set(pins[0].sportIDs) == ["ski", "trail"])
    }

    @Test func aSportAppearsOnlyOnceOnAPin() async throws {
        let clock = Clock(start: Self.t0)
        let backend = InMemoryBackend(now: { clock.now })
        let a = await register(backend, "A", sports: ["ski", "trail"]), b = await register(backend, "B")
        let first = try await backend.startSession(userID: a.id, sportID: "ski")
        try await backend.updatePosition(sessionID: first.id, latitude: 45.9, longitude: 6.8)
        try await backend.stopSession(sessionID: first.id)
        clock.advance(minutes: 5)
        try await startWithPosition(backend, a, sport: "ski") // nouvelle session pendant que la précédente est "récemment active"
        try await startWithPosition(backend, a, sport: "trail")
        let pin = try #require(await backend.pins(for: b.id).first)
        #expect(pin.sportIDs.count == 2)
        #expect(Set(pin.sportIDs) == ["ski", "trail"])
    }

    @Test func stoppedSessionLingersThenDisappears() async throws {
        let clock = Clock(start: Self.t0)
        let backend = InMemoryBackend(now: { clock.now })
        let a = await register(backend, "A"), b = await register(backend, "B")
        let session = try await backend.startSession(userID: a.id, sportID: "ski")
        try await backend.updatePosition(sessionID: session.id, latitude: 45.9, longitude: 6.8)
        try await backend.stopSession(sessionID: session.id)

        #expect(await backend.pins(for: b.id).first?.status == .recentlyActive)
        clock.advance(minutes: 16)
        #expect(await backend.pins(for: b.id).isEmpty)
    }

    @Test func ownPinDisappearsAfterLingerAndIgnoresOldHistory() async throws {
        let clock = Clock(start: Self.t0)
        let backend = InMemoryBackend(now: { clock.now })
        let a = await register(backend, "A")
        await backend.backfillHistory(userID: a.id, sportID: "ski", geohash: "u0h4s5p", days: 3)
        #expect(await backend.pins(for: a.id).isEmpty, "l'historique ancien ne crée pas de pin")

        let session = try await backend.startSession(userID: a.id, sportID: "ski")
        try await backend.updatePosition(sessionID: session.id, latitude: 45.9, longitude: 6.8)
        #expect(await backend.pins(for: a.id).first?.status == .active)

        try await backend.stopSession(sessionID: session.id)
        #expect(await backend.pins(for: a.id).first?.status == .recentlyActive)
        clock.advance(minutes: 16)
        #expect(await backend.pins(for: a.id).isEmpty, "mon pin disparaît après le délai, comme pour les autres")
    }

    @Test func invisibleToggleAppliesDuringActiveSession() async throws {
        let backend = makeBackend()
        var a = await register(backend, "A"); let b = await register(backend, "B")
        try await startWithPosition(backend, a)
        #expect(await backend.pins(for: b.id).count == 1)

        a.visibility.isInvisible = true
        await backend.upsert(user: a)
        #expect(await backend.pins(for: b.id).isEmpty)
        #expect(await backend.pins(for: a.id).first?.isVisibleToOthers == false, "je me vois toujours, en grisé")
    }

    // MARK: Alliances

    @Test func allianceNeedsRecipientAcceptance() async throws {
        let backend = makeBackend()
        let a = await register(backend, "A"), b = await register(backend, "B")
        let alliance = try await backend.requestAlliance(from: a.id, to: b.id)

        // Le demandeur ne peut pas accepter sa propre demande.
        await #expect(throws: BackendError.notAllowed) {
            try await backend.respondToAlliance(id: alliance.id, by: a.id, accept: true)
        }
        var overview = await backend.allianceOverview(for: b.id)
        #expect(overview.incoming.count == 1)
        #expect(overview.allies.isEmpty)

        try await backend.respondToAlliance(id: alliance.id, by: b.id, accept: true)
        overview = await backend.allianceOverview(for: b.id)
        #expect(overview.allies.map(\.other.firstName) == ["A"])
    }

    @Test func declinedRequestDisappearsAndDuplicatesAreRejected() async throws {
        let backend = makeBackend()
        let a = await register(backend, "A"), b = await register(backend, "B")
        let alliance = try await backend.requestAlliance(from: a.id, to: b.id)
        await #expect(throws: BackendError.alreadyExists) {
            _ = try await backend.requestAlliance(from: b.id, to: a.id)
        }
        try await backend.respondToAlliance(id: alliance.id, by: b.id, accept: false)
        let overview = await backend.allianceOverview(for: a.id)
        #expect(overview.outgoing.isEmpty && overview.allies.isEmpty)
    }

    @Test func myAlliancesScopeShowsPinOnlyToAllies() async throws {
        let backend = makeBackend()
        let a = await register(backend, "A", scope: .myAlliances)
        let friend = await register(backend, "Ami"), stranger = await register(backend, "Inconnu")
        try await startWithPosition(backend, a)

        let request = try await backend.requestAlliance(from: friend.id, to: a.id)
        try await backend.respondToAlliance(id: request.id, by: a.id, accept: true)

        #expect(await backend.pins(for: friend.id).count == 1)
        #expect(await backend.pins(for: stranger.id).isEmpty)
    }

    // MARK: Modération

    @Test func blockRemovesEachOtherEverywhere() async throws {
        let backend = makeBackend()
        let a = await register(backend, "A"), b = await register(backend, "B")
        try await startWithPosition(backend, a)
        try await startWithPosition(backend, b)
        let request = try await backend.requestAlliance(from: a.id, to: b.id)
        try await backend.respondToAlliance(id: request.id, by: b.id, accept: true)

        try await backend.block(b.id, by: a.id)

        #expect(await backend.pins(for: a.id).map(\.userID) == [a.id])
        #expect(await backend.pins(for: b.id).map(\.userID) == [b.id])
        #expect(await backend.profile(of: b.id, viewedBy: a.id) == nil)
        #expect(await backend.profile(of: a.id, viewedBy: b.id) == nil)
        #expect(await backend.allianceOverview(for: a.id).allies.isEmpty, "le blocage rompt l'Alliance")

        await backend.unblock(b.id, by: a.id)
        #expect(await backend.pins(for: a.id).count == 2)
    }

    @Test func blockedUserNeverAppearsInEchoes() async throws {
        let backend = makeBackend()
        let a = await register(backend, "A"), b = await register(backend, "B")
        await backend.backfillHistory(userID: a.id, sportID: "ski", geohash: "u0h4s5p", days: 3)
        await backend.backfillHistory(userID: b.id, sportID: "ski", geohash: "u0h4s5p", days: 3)

        let echoes = await backend.echoes(for: a.id)
        #expect(echoes.map(\.user.firstName) == ["B"])
        #expect(echoes.first?.sportID == "ski")

        try await backend.block(b.id, by: a.id)
        #expect(await backend.echoes(for: a.id).isEmpty)
        #expect(await backend.echoes(for: b.id).isEmpty)
    }

    @Test func echoSkipsLinkedUsersAndAlliancesOnlyProfiles() async throws {
        let backend = makeBackend()
        let a = await register(backend, "A")
        let linked = await register(backend, "Lié"), closed = await register(backend, "Fermé", scope: .myAlliances)
        for user in [a, linked, closed] {
            await backend.backfillHistory(userID: user.id, sportID: "ski", geohash: "u0h4s5p", days: 3)
        }
        #expect(await backend.echoes(for: a.id).map(\.user.firstName) == ["Lié"], "un profil en 'mes Alliances' n'est jamais suggéré")

        _ = try await backend.requestAlliance(from: a.id, to: linked.id)
        #expect(await backend.echoes(for: a.id).isEmpty)
    }

    // MARK: Tribus

    @Test func tribuLifecycle() async throws {
        let backend = makeBackend()
        let a = await register(backend, "A"), b = await register(backend, "B")
        let tribu = try await backend.createTribu(name: "  Poudreuse  ", creatorID: a.id)
        #expect(tribu.name == "Poudreuse")

        #expect(await backend.tribus(for: b.id).discover.map(\.name) == ["Poudreuse"])
        try await backend.joinTribu(id: tribu.id, userID: b.id)
        #expect(await backend.tribus(for: b.id).mine.first?.memberIDs.count == 2)

        try await backend.leaveTribu(id: tribu.id, userID: b.id)
        try await backend.leaveTribu(id: tribu.id, userID: a.id)
        let overviewA = await backend.tribus(for: a.id)
        #expect(overviewA.mine.isEmpty && overviewA.discover.isEmpty, "une tribu vide disparaît")
    }

    // MARK: Démo

    @Test func demoPopulationProducesLiveMapAndWelcomeRequests() async throws {
        let backend = InMemoryBackend(botReplyDelay: .seconds(1), welcomeRequestCount: 2)
        let simulator = await DemoData.populate(backend, botCount: 60, seed: 7)
        for _ in 0..<20 { await simulator.tick() }

        let me = await register(backend, "Moi", sports: ["ski", "running"])
        let pins = await backend.pins(for: me.id)
        #expect(pins.count > 5)
        #expect(pins.allSatisfy { (40...52).contains($0.coordinate.latitude) && (-6...10).contains($0.coordinate.longitude) })
        #expect(await backend.allianceOverview(for: me.id).incoming.count == 2)
    }

    @Test func demoBotAcceptsRequestAfterDelay() async throws {
        let backend = InMemoryBackend(botReplyDelay: .milliseconds(50))
        _ = await DemoData.populate(backend, botCount: 5, seed: 1)
        let me = await register(backend, "Moi")
        let botID = try #require(await backend.pins(for: me.id).first?.userID)
        _ = try await backend.requestAlliance(from: me.id, to: botID)
        try await Task.sleep(for: .milliseconds(300))
        #expect(await backend.allianceOverview(for: me.id).allies.count == 1)
    }
}

/// Horloge contrôlable pour les tests.
final class Clock: @unchecked Sendable {
    private let lock = NSLock()
    private var current: Date

    init(start: Date) { current = start }

    var now: Date { lock.lock(); defer { lock.unlock() }; return current }
    func advance(minutes: Double) { lock.lock(); current = current.addingTimeInterval(minutes * 60); lock.unlock() }
}
