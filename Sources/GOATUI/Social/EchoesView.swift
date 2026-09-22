import SwiftUI
import GOATCore

struct EchoesView: View {
    @Environment(AppState.self) private var state
    @State private var selectedProfile: ProfileRoute?

    var body: some View {
        NavigationStack {
            Group {
                if state.echoes.isEmpty {
                    ContentUnavailableView(
                        "Pas encore d'Echo",
                        systemImage: "dot.radiowaves.left.and.right",
                        description: Text("Les Echos te suggèrent des pratiquants du même sport qui fréquentent régulièrement les mêmes endroits que toi. Ils apparaissent après quelques jours de pratique.")
                    )
                } else {
                    List(state.echoes) { echo in
                        HStack(spacing: 12) {
                            Button { selectedProfile = ProfileRoute(id: echo.user.id) } label: {
                                HStack(spacing: 12) {
                                    AvatarView(name: echo.user.firstName, photoData: echo.user.photoData, size: 44)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(echo.user.firstName).font(.body.weight(.medium)).foregroundStyle(.primary)
                                        if let sport = SportCatalog.sport(id: echo.sportID) {
                                            SportBadge(sport: sport, compact: true)
                                        }
                                    }
                                    Spacer(minLength: 0)
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)

                            Button("Alliance") { Task { await state.requestAlliance(to: echo.user.id) } }
                                .buttonStyle(.borderedProminent).controlSize(.small)
                        }
                    }
                }
            }
            .navigationTitle("Echos")
            .refreshable { await state.refreshEchoes() }
            .sheet(item: $selectedProfile) { route in
                MiniProfileSheet(userID: route.id).presentationDetents([.medium, .large])
            }
        }
    }
}
