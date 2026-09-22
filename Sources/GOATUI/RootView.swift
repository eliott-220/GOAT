import SwiftUI
import GOATCore

/// Point d'entrée de l'interface : à placer dans la `WindowGroup` de l'app.
public struct GOATRootView: View {
    @State private var state = AppState()
    @Environment(\.scenePhase) private var scenePhase

    public init() {}

    public var body: some View {
        Group {
            switch state.phase {
            case .loading: ProgressView("Chargement…")
            case .onboarding: OnboardingView()
            case .ready: MainTabView()
            }
        }
        .environment(state)
        .tint(Theme.accent)
        .task { await state.bootstrap() }
        .onChange(of: scenePhase) { _, phase in state.setForeground(phase == .active) }
        .alert("Oups", isPresented: errorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(state.errorMessage ?? "")
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { state.errorMessage != nil },
            set: { if !$0 { state.errorMessage = nil } }
        )
    }
}

struct MainTabView: View {
    @Environment(AppState.self) private var state

    var body: some View {
        TabView {
            MapScreen()
                .tabItem { Label("Carte", systemImage: "map.fill") }
            AlliancesView()
                .tabItem { Label("Alliances", systemImage: "person.2.fill") }
                .badge(state.alliances.incoming.count)
            EchoesView()
                .tabItem { Label("Echos", systemImage: "dot.radiowaves.left.and.right") }
                .badge(state.echoes.count)
            ProfileView()
                .tabItem { Label("Profil", systemImage: "person.crop.circle.fill") }
        }
    }
}
