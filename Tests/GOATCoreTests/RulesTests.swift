import Foundation
import Testing
@testable import GOATCore

@Suite struct RulesTests {
    let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func user(_ name: String, sports: [String] = ["ski"], scope: VisibilityScope = .everyone) -> User {
        User(firstName: name, sports: sports.map { UserSport(sportID: $0) },
             visibility: VisibilitySettings(scope: scope, isInvisible: false, lingerMinutes: 15))
    }

    private func liveSession(_ user: User, sport: String = "ski", endedMinutesAgo: Double? = nil) -> ActivitySession {
        ActivitySession(
            userID: user.id, sportID: sport, geohash: "u0h4s5p",
            startedAt: now.addingTimeInterval(-7_200),
            endedAt: endedMinutesAgo.map { now.addingTimeInterval(-$0 * 60) }
        )
    }

    // MARK: Statut de session

    @Test func sessionStatusLifecycle() {
        let running = ActivitySession(userID: UUID(), sportID: "ski", startedAt: now.addingTimeInterval(-600))
        #expect(running.status(at: now, lingerMinutes: 15) == .active)

        var ended = running
        ended.endedAt = now.addingTimeInterval(-14 * 60)
        #expect(ended.status(at: now, lingerMinutes: 15) == .recentlyActive)

        ended.endedAt = now.addingTimeInterval(-16 * 60)
        #expect(ended.status(at: now, lingerMinutes: 15) == .finished)
        #expect(ended.status(at: now, lingerMinutes: 30) == .recentlyActive, "le délai est réglable")
    }

    // MARK: Visibilité

    @Test func everyoneSeesPublicUser() {
        let viewer = user("A", sports: ["surf"]), target = user("B")
        #expect(VisibilityPolicy.canSee(viewer: viewer, target: target, session: liveSession(target), graph: SocialGraph(), now: now))
    }

    @Test func mySportsScopeRequiresSharedSport() {
        let target = user("B", scope: .mySports)
        let skier = user("A", sports: ["ski"]), surfer = user("C", sports: ["surf"])
        let session = liveSession(target)
        #expect(VisibilityPolicy.canSee(viewer: skier, target: target, session: session, graph: SocialGraph(), now: now))
        #expect(!VisibilityPolicy.canSee(viewer: surfer, target: target, session: session, graph: SocialGraph(), now: now))
    }

    @Test func myAlliancesScopeRequiresAcceptedAlliance() {
        let target = user("B", scope: .myAlliances), viewer = user("A")
        let session = liveSession(target)
        let pending = Alliance(userA: viewer.id, userB: target.id, status: .pending)
        let accepted = Alliance(userA: viewer.id, userB: target.id, status: .accepted)
        #expect(!VisibilityPolicy.canSee(viewer: viewer, target: target, session: session, graph: SocialGraph(alliances: [pending]), now: now))
        #expect(VisibilityPolicy.canSee(viewer: viewer, target: target, session: session, graph: SocialGraph(alliances: [accepted]), now: now))
    }

    @Test func invisibleUserIsHiddenEvenDuringActiveSession() {
        var target = user("B")
        target.visibility.isInvisible = true
        #expect(!VisibilityPolicy.canSee(viewer: user("A"), target: target, session: liveSession(target), graph: SocialGraph(), now: now))
    }

    @Test func sessionWithoutPositionIsNotVisible() {
        let target = user("B")
        var session = liveSession(target)
        session.geohash = nil
        #expect(!VisibilityPolicy.canSee(viewer: user("A"), target: target, session: session, graph: SocialGraph(), now: now))
    }

    @Test func finishedSessionIsNotVisibleButRecentOneIs() {
        let target = user("B"), viewer = user("A")
        #expect(VisibilityPolicy.canSee(viewer: viewer, target: target, session: liveSession(target, endedMinutesAgo: 10), graph: SocialGraph(), now: now))
        #expect(!VisibilityPolicy.canSee(viewer: viewer, target: target, session: liveSession(target, endedMinutesAgo: 20), graph: SocialGraph(), now: now))
    }

    @Test func ownPinFollowsTheSessionLifecycle() {
        let me = user("A")
        let graph = SocialGraph()
        #expect(VisibilityPolicy.canSee(viewer: me, target: me, session: liveSession(me), graph: graph, now: now))
        #expect(VisibilityPolicy.canSee(viewer: me, target: me, session: liveSession(me, endedMinutesAgo: 10), graph: graph, now: now))
        #expect(!VisibilityPolicy.canSee(viewer: me, target: me, session: liveSession(me, endedMinutesAgo: 20), graph: graph, now: now),
                "mon pin ne doit pas rester affiché indéfiniment après la fin de session")
        var noPosition = liveSession(me)
        noPosition.geohash = nil
        #expect(!VisibilityPolicy.canSee(viewer: me, target: me, session: noPosition, graph: graph, now: now))
    }

    @Test func blockHidesBothWays() {
        let a = user("A"), b = user("B")
        let graph = SocialGraph(blocks: [Block(blocker: a.id, blocked: b.id)])
        #expect(!VisibilityPolicy.canSee(viewer: a, target: b, session: liveSession(b), graph: graph, now: now))
        #expect(!VisibilityPolicy.canSee(viewer: b, target: a, session: liveSession(a), graph: graph, now: now))
    }

    // MARK: Echos

    @Test func echoNeedsSharedSportAndRecurrentZone() {
        let a = UUID(), b = UUID(), c = UUID()
        func session(_ user: UUID, _ sport: String, dayOffset: Int) -> ActivitySession {
            ActivitySession(userID: user, sportID: sport, geohash: "u0h4s5p", startedAt: now.addingTimeInterval(-Double(dayOffset) * 86_400))
        }
        let sessions = [
            session(a, "ski", dayOffset: 1), session(a, "ski", dayOffset: 3),
            session(b, "ski", dayOffset: 2), session(b, "ski", dayOffset: 5),
            session(c, "ski", dayOffset: 1),                                   // une seule journée : pas récurrent
            session(c, "surf", dayOffset: 4), session(c, "surf", dayOffset: 6), // autre sport
        ]
        let echoes = EchoEngine().generate(sessions: sessions, excluding: [], now: now)
        #expect(echoes.count == 1)
        #expect(echoes.first?.commonSportID == "ski")
        #expect(Set([echoes[0].userA, echoes[0].userB]) == Set([a, b]))
    }

    @Test func echoRequiresSameZone() {
        let a = UUID(), b = UUID()
        func session(_ user: UUID, _ hash: String, _ day: Int) -> ActivitySession {
            ActivitySession(userID: user, sportID: "running", geohash: hash, startedAt: now.addingTimeInterval(-Double(day) * 86_400))
        }
        let sessions = [session(a, "u09tv12", 1), session(a, "u09tv12", 2), session(b, "spey61y", 1), session(b, "spey61y", 2)]
        #expect(EchoEngine().generate(sessions: sessions, excluding: [], now: now).isEmpty)
    }

    @Test func echoIgnoresExcludedPairsAndOldSessions() {
        let a = UUID(), b = UUID()
        func session(_ user: UUID, _ day: Int) -> ActivitySession {
            ActivitySession(userID: user, sportID: "ski", geohash: "u0h4s5p", startedAt: now.addingTimeInterval(-Double(day) * 86_400))
        }
        let recent = [session(a, 1), session(a, 2), session(b, 1), session(b, 2)]
        #expect(EchoEngine().generate(sessions: recent, excluding: [], now: now).count == 1)
        #expect(EchoEngine().generate(sessions: recent, excluding: [UserPair(a, b)], now: now).isEmpty)

        let old = [session(a, 100), session(a, 101), session(b, 100), session(b, 101)]
        #expect(EchoEngine().generate(sessions: old, excluding: [], now: now).isEmpty)
    }
}

@Suite struct SportSelectionTests {
    @Test func firstSportBecomesPrimary() {
        var sports: [UserSport] = []
        sports.toggle("ski")
        sports.toggle("trail")
        #expect(sports == [UserSport(sportID: "ski", isPrimary: true), UserSport(sportID: "trail", isPrimary: false)])
    }

    @Test func removingPrimaryPromotesAnotherSport() {
        var sports = [UserSport(sportID: "ski", isPrimary: true), UserSport(sportID: "trail")]
        sports.toggle("ski")
        #expect(sports == [UserSport(sportID: "trail", isPrimary: true)])
        sports.toggle("trail")
        #expect(sports.isEmpty)
    }

    @Test func makePrimaryKeepsExactlyOne() {
        var sports = [UserSport(sportID: "ski", isPrimary: true), UserSport(sportID: "trail"), UserSport(sportID: "yoga")]
        sports.makePrimary("yoga")
        #expect(sports.filter(\.isPrimary).map(\.sportID) == ["yoga"])
        sports.makePrimary("surf") // pas dans la liste : sans effet
        #expect(sports.filter(\.isPrimary).map(\.sportID) == ["yoga"])
    }
}
