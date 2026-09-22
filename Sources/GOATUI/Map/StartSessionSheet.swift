import SwiftUI
import GOATCore

struct StartSessionSheet: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss

    private var sports: [Sport] {
        let profile = state.me?.sports ?? []
        let ordered = profile.sorted { $0.isPrimary && !$1.isPrimary }
        return ordered.compactMap { SportCatalog.sport(id: $0.sportID) }
    }

    private var activeSportIDs: Set<String> { Set(state.mySessions.map(\.sportID)) }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(sports) { sport in
                        let isRunning = activeSportIDs.contains(sport.id)
                        Button {
                            Task {
                                await state.startSession(sportID: sport.id)
                                dismiss()
                            }
                        } label: {
                            HStack {
                                Image(systemName: sport.symbol)
                                    .frame(width: 32)
                                    .foregroundStyle(sport.tint)
                                Text(sport.name)
                                if state.me?.primarySportID == sport.id {
                                    Image(systemName: "star.fill").font(.caption).foregroundStyle(.yellow)
                                }
                                Spacer()
                                if isRunning { Text("En cours").font(.caption).foregroundStyle(.secondary) }
                            }
                        }
                        .disabled(isRunning)
                    }
                } header: {
                    Text("Quel sport ?")
                } footer: {
                    Text(footer)
                }
            }
            .navigationTitle("Nouvelle session")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
            }
        }
    }

    private var footer: String {
        let linger = state.me?.visibility.lingerMinutes ?? 15
        let after = linger == 0 ? "Tu disparais dès l'arrêt." : "Tu restes visible \(linger) min après l'arrêt."
        return "Tu apparais sur la carte avec une position approximative (~150 m), jamais exacte. \(after) Tu peux te rendre invisible à tout moment."
    }
}
