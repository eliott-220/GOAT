import SwiftUI
import GOATCore
#if canImport(UIKit)
import UIKit
#endif

struct SessionSheet: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if state.mySessions.isEmpty {
                    ContentUnavailableView("Aucune session en cours", systemImage: "figure.walk",
                                           description: Text("Démarre une session pour apparaître sur la carte."))
                } else {
                    Section("En cours") {
                        ForEach(state.mySessions) { session in
                            sessionRow(session)
                        }
                    }
                    Section {
                        Toggle(isOn: invisibleBinding) {
                            Label("Mettre ma visibilité en pause", systemImage: "eye.slash")
                        }
                    } footer: {
                        Text("Ta session continue, mais personne ne te voit sur la carte tant que c'est activé.")
                    }
                    locationSection
                }
            }
            .navigationTitle("Session")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() } }
            }
        }
    }

    private func sessionRow(_ session: ActivitySession) -> some View {
        HStack {
            if let sport = SportCatalog.sport(id: session.sportID) {
                Image(systemName: sport.symbol).frame(width: 32).foregroundStyle(sport.tint)
                VStack(alignment: .leading) {
                    Text(sport.name).font(.headline)
                    Text(session.startedAt, style: .timer).monospacedDigit().foregroundStyle(.secondary)
                }
            }
            Spacer()
            Button("Arrêter", role: .destructive) {
                Task {
                    await state.stopSession(id: session.id)
                    if state.mySessions.isEmpty { dismiss() }
                }
            }
            .buttonStyle(.bordered)
        }
    }

    @ViewBuilder private var locationSection: some View {
        if state.location.isDenied {
            Section {
                Label("La localisation est désactivée : tu n'apparais pas sur la carte.", systemImage: "location.slash")
                    .foregroundStyle(.orange)
                #if os(iOS)
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    Link("Ouvrir les Réglages", destination: url)
                }
                #endif
            }
        } else if state.location.authorization == .notDetermined {
            Section {
                Button("Autoriser la localisation") { state.location.requestPermission() }
            } footer: {
                Text("Sans position, ta session est active mais tu n'apparais pas sur la carte.")
            }
        } else if state.isAwaitingPosition {
            Section {
                HStack { ProgressView(); Text("Recherche de ta position…").foregroundStyle(.secondary) }
            }
        }
    }

    private var invisibleBinding: Binding<Bool> {
        Binding(
            get: { state.me?.visibility.isInvisible ?? false },
            set: { newValue in state.updateProfile { $0.visibility.isInvisible = newValue } }
        )
    }
}
