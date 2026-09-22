import Foundation
import GOATCore
import Observation

/// État applicatif partagé par tous les écrans. Tout passe par `PresenceBackend` :
/// remplacer `InMemoryBackend` par une implémentation Supabase/Firebase ne touche pas aux vues.
@MainActor @Observable
public final class AppState {
    public enum Phase { case loading, onboarding, ready }

    public private(set) var phase: Phase = .loading
    public private(set) var me: User?
    public private(set) var pins: [PresencePin] = []
    public private(set) var mySessions: [ActivitySession] = []
    public private(set) var history: [ActivitySession] = []
    public private(set) var alliances = AllianceOverview.empty
    public private(set) var tribus = TribuOverview.empty
    public private(set) var echoes: [EchoSuggestion] = []
    public private(set) var blockedUsers: [User] = []

    /// Filtre de la carte : nil = tous les sports.
    public var sportFilter: String?
    public var errorMessage: String?
    public let location = LocationProvider()

    @ObservationIgnored private let backend: PresenceBackend
    @ObservationIgnored private let demoBackend: InMemoryBackend?
    @ObservationIgnored private var simulator: DemoSimulator?
    @ObservationIgnored private let store: LocalStore
    @ObservationIgnored private var liveTask: Task<Void, Never>?
    @ObservationIgnored private var positionTask: Task<Void, Never>?
    @ObservationIgnored private var isForeground = true

    /// Intervalle de mise à jour de position pendant une session (spec : 10-15 s, pas de flux continu).
    private static let positionInterval: Duration = .seconds(12)
    private static let refreshInterval: Duration = .seconds(4)

    /// Sans argument : backend en mémoire alimenté par des utilisateurs de démo répartis sur la France.
    public convenience init(backend: PresenceBackend? = nil) {
        self.init(backend: backend, store: LocalStore())
    }

    init(backend: PresenceBackend?, store: LocalStore) {
        self.store = store
        if let backend {
            self.backend = backend
            demoBackend = nil
        } else {
            let mock = InMemoryBackend(botReplyDelay: .seconds(4), welcomeRequestCount: 2)
            self.backend = mock
            demoBackend = mock
        }
    }

    // MARK: Cycle de vie

    public func bootstrap() async {
        guard phase == .loading else { return }
        if let demoBackend { simulator = await DemoData.populate(demoBackend) }
        if let saved = store.loadUser() {
            me = saved
            await backend.upsert(user: saved)
            phase = .ready
            await refreshAll()
            updateLiveTasks()
        } else {
            phase = .onboarding
        }
    }

    public func setForeground(_ active: Bool) {
        isForeground = active
        updateLiveTasks()
        if active, phase == .ready { Task { await refreshAll() } }
    }

    public func completeOnboarding(firstName: String, sports: [UserSport]) async {
        let user = User(firstName: firstName.trimmingCharacters(in: .whitespacesAndNewlines), sports: sports)
        me = user
        store.save(user)
        await backend.upsert(user: user)
        phase = .ready
        await refreshAll()
        updateLiveTasks()
    }

    public func signOut() async {
        for session in mySessions { try? await backend.stopSession(sessionID: session.id) }
        store.clear()
        me = nil
        pins = []; mySessions = []; history = []; echoes = []
        alliances = .empty; tribus = .empty; blockedUsers = []
        phase = .onboarding
        updateLiveTasks()
    }

    // MARK: Profil & visibilité

    public func updateProfile(_ change: (inout User) -> Void) {
        guard var user = me else { return }
        change(&user)
        me = user
        store.save(user)
        Task {
            await backend.upsert(user: user)
            await refreshPins()
        }
    }

    // MARK: Sessions

    public func startSession(sportID: String) async {
        guard let me else { return }
        if location.authorization == .notDetermined { location.requestPermission() }
        await run {
            _ = try await self.backend.startSession(userID: me.id, sportID: sportID)
            await self.refreshSessions()
            self.updateLiveTasks()
            await self.refreshPins()
        }
    }

    public func stopSession(id: UUID) async {
        await run {
            try await self.backend.stopSession(sessionID: id)
            await self.refreshSessions()
            self.updateLiveTasks()
            await self.refreshPins()
            await self.refreshEchoes()
        }
    }

    /// Vrai si une session est active mais qu'aucune position n'a encore pu être envoyée.
    public var isAwaitingPosition: Bool { !mySessions.isEmpty && location.lastCoordinate == nil }

    // MARK: Social

    public func profile(of userID: UUID) async -> MiniProfile? {
        guard let me else { return nil }
        return await backend.profile(of: userID, viewedBy: me.id)
    }

    public func requestAlliance(to userID: UUID) async {
        guard let me else { return }
        await run {
            _ = try await self.backend.requestAlliance(from: me.id, to: userID)
            await self.refreshSocial()
        }
    }

    public func respondToAlliance(id: UUID, accept: Bool) async {
        guard let me else { return }
        await run {
            try await self.backend.respondToAlliance(id: id, by: me.id, accept: accept)
            await self.refreshSocial()
            await self.refreshPins()
        }
    }

    public func createTribu(name: String) async {
        guard let me else { return }
        await run {
            _ = try await self.backend.createTribu(name: name, creatorID: me.id)
            await self.refreshSocial()
        }
    }

    public func joinTribu(id: UUID) async {
        guard let me else { return }
        await run {
            try await self.backend.joinTribu(id: id, userID: me.id)
            await self.refreshSocial()
        }
    }

    public func leaveTribu(id: UUID) async {
        guard let me else { return }
        await run {
            try await self.backend.leaveTribu(id: id, userID: me.id)
            await self.refreshSocial()
        }
    }

    // MARK: Modération

    public func block(_ userID: UUID) async {
        guard let me else { return }
        await run {
            try await self.backend.block(userID, by: me.id)
            await self.refreshAll()
        }
    }

    public func unblock(_ userID: UUID) async {
        guard let me else { return }
        await backend.unblock(userID, by: me.id)
        await refreshAll()
    }

    public func report(_ userID: UUID, reason: String) async {
        guard let me else { return }
        await run { try await self.backend.report(userID, by: me.id, reason: reason) }
    }

    // MARK: Rafraîchissement

    public func refreshAll() async {
        await refreshSessions()
        await refreshPins()
        await refreshSocial()
    }

    public func refreshPins() async {
        guard let me else { return }
        pins = await backend.pins(for: me.id)
    }

    public func refreshSessions() async {
        guard let me else { return }
        mySessions = await backend.activeSessions(userID: me.id)
        history = await backend.history(userID: me.id)
    }

    public func refreshEchoes() async {
        guard let me else { return }
        echoes = await backend.echoes(for: me.id)
    }

    public func refreshSocial() async {
        guard let me else { return }
        alliances = await backend.allianceOverview(for: me.id)
        tribus = await backend.tribus(for: me.id)
        blockedUsers = await backend.blockedUsers(of: me.id)
        await refreshEchoes()
    }

    // MARK: Boucles en arrière-plan de l'app (uniquement au premier plan)

    private func updateLiveTasks() {
        let shouldRefresh = phase == .ready && isForeground
        if shouldRefresh, liveTask == nil {
            liveTask = Task { [weak self] in
                var iteration = 0
                while !Task.isCancelled {
                    guard let self else { return }
                    await self.simulator?.tick()
                    await self.refreshPins()
                    await self.refreshSessions()
                    if iteration % 5 == 0 { await self.refreshSocial() }
                    iteration += 1
                    try? await Task.sleep(for: Self.refreshInterval)
                }
            }
        } else if !shouldRefresh {
            liveTask?.cancel()
            liveTask = nil
        }

        // La localisation ne tourne que si une session est active ; coupure automatique à la fin.
        let shouldTrackPosition = shouldRefresh && !mySessions.isEmpty
        if shouldTrackPosition, positionTask == nil {
            location.start()
            positionTask = Task { [weak self] in
                while !Task.isCancelled {
                    guard let self else { return }
                    let sent = await self.pushPosition()
                    // Tant qu'aucune position n'est disponible, on réessaie vite ; ensuite toutes les 12 s.
                    try? await Task.sleep(for: sent ? Self.positionInterval : .seconds(2))
                }
            }
        } else if !shouldTrackPosition {
            positionTask?.cancel()
            positionTask = nil
            location.stop()
        }
    }

    private func pushPosition() async -> Bool {
        if !location.isAuthorized { return false }
        location.start()
        guard let coordinate = location.lastCoordinate else { return false }
        for session in mySessions {
            try? await backend.updatePosition(sessionID: session.id, latitude: coordinate.latitude, longitude: coordinate.longitude)
        }
        await refreshPins()
        return true
    }

    private func run(_ action: @escaping () async throws -> Void) async {
        do { try await action() } catch { errorMessage = error.localizedDescription }
    }

    // MARK: Outils de démo

    public var supportsDemoTools: Bool { demoBackend != nil }

    /// Ajoute 3 jours de pratique près d'un utilisateur de démo du même sport, pour voir apparaître des Echos.
    public func demoSimulateRecurringPractice() async {
        guard let me, let sportID = me.primarySportID, let demoBackend else { return }
        guard let spot = await simulator?.spot(forSport: sportID) else {
            errorMessage = "Aucun utilisateur de démo ne pratique \(sportName(sportID))."
            return
        }
        await demoBackend.backfillHistory(
            userID: me.id, sportID: sportID,
            geohash: Geohash.encode(latitude: spot.latitude, longitude: spot.longitude), days: 3
        )
        await refreshAll()
    }
}
