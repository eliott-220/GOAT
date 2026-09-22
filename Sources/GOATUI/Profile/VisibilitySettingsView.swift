import SwiftUI
import GOATCore

struct VisibilitySettingsView: View {
    @Environment(AppState.self) private var state

    private var settings: VisibilitySettings { state.me?.visibility ?? .default }

    var body: some View {
        Form {
            Section {
                Toggle(isOn: binding(\.isInvisible)) {
                    Label("Mode invisible", systemImage: "eye.slash")
                }
            } footer: {
                Text("Tu disparais de la carte immédiatement, même pendant une session. Tu te vois toujours en grisé.")
            }

            Section {
                Picker("Qui peut me voir", selection: binding(\.scope)) {
                    ForEach(VisibilityScope.allCases, id: \.self) { Text($0.displayName).tag($0) }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            } header: {
                Text("Qui peut me voir")
            } footer: {
                Text("S'applique à la carte et aux suggestions d'Echos. Tu peux le changer à tout moment.")
            }

            Section {
                Picker("Délai avant invisibilité", selection: binding(\.lingerMinutes)) {
                    ForEach(VisibilitySettings.lingerOptions, id: \.self) { minutes in
                        Text(minutes == 0 ? "Aucun" : "\(minutes) min").tag(minutes)
                    }
                }
            } footer: {
                Text("Temps pendant lequel tu restes affiché comme « récemment actif » après l'arrêt d'une session.")
            }

            Section("Profils bloqués") {
                if state.blockedUsers.isEmpty {
                    Text("Aucun profil bloqué.").foregroundStyle(.secondary)
                }
                ForEach(state.blockedUsers) { user in
                    HStack {
                        Text(user.firstName)
                        Spacer()
                        Button("Débloquer") { Task { await state.unblock(user.id) } }
                            .buttonStyle(.bordered).controlSize(.small)
                    }
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Visibilité")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    private func binding<Value>(_ keyPath: WritableKeyPath<VisibilitySettings, Value>) -> Binding<Value> {
        Binding(
            get: { settings[keyPath: keyPath] },
            set: { newValue in state.updateProfile { $0.visibility[keyPath: keyPath] = newValue } }
        )
    }
}
