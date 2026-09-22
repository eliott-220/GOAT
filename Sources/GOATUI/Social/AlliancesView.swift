import SwiftUI
import GOATCore

struct AlliancesView: View {
    @Environment(AppState.self) private var state
    @State private var selectedProfile: ProfileRoute?
    @State private var showNewTribu = false
    @State private var newTribuName = ""

    var body: some View {
        NavigationStack {
            List {
                if !state.alliances.incoming.isEmpty {
                    Section("Demandes reçues") {
                        ForEach(state.alliances.incoming) { entry in
                            HStack {
                                personRow(entry.other)
                                Button { Task { await state.respondToAlliance(id: entry.alliance.id, accept: true) } } label: {
                                    Image(systemName: "checkmark.circle.fill").font(.title2).foregroundStyle(Theme.live)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Accepter \(entry.other.firstName)")
                                Button { Task { await state.respondToAlliance(id: entry.alliance.id, accept: false) } } label: {
                                    Image(systemName: "xmark.circle.fill").font(.title2).foregroundStyle(.secondary)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Refuser \(entry.other.firstName)")
                            }
                        }
                    }
                }

                Section("Alliés") {
                    if state.alliances.allies.isEmpty {
                        Text("Pas encore d'Alliance. Tape sur un pin de la carte ou sur un Echo pour en demander une.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    ForEach(state.alliances.allies) { entry in personRow(entry.other) }
                }

                if !state.alliances.outgoing.isEmpty {
                    Section("Demandes envoyées") {
                        ForEach(state.alliances.outgoing) { entry in
                            HStack {
                                personRow(entry.other)
                                Text("En attente").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Section("Mes tribus") {
                    if state.tribus.mine.isEmpty {
                        Text("Tu n'as rejoint aucune tribu.").font(.subheadline).foregroundStyle(.secondary)
                    }
                    ForEach(state.tribus.mine) { tribu in
                        HStack {
                            Label(tribu.name, systemImage: "flame")
                            Spacer()
                            Text("\(tribu.memberIDs.count) membre\(tribu.memberIDs.count > 1 ? "s" : "")")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        .swipeActions {
                            Button("Quitter", role: .destructive) { Task { await state.leaveTribu(id: tribu.id) } }
                        }
                    }
                }

                if !state.tribus.discover.isEmpty {
                    Section("Tribus à rejoindre") {
                        ForEach(state.tribus.discover) { tribu in
                            HStack {
                                Label(tribu.name, systemImage: "flame")
                                Spacer()
                                Button("Rejoindre") { Task { await state.joinTribu(id: tribu.id) } }
                                    .buttonStyle(.bordered).controlSize(.small)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Alliances")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Nouvelle tribu", systemImage: "plus") {
                        newTribuName = ""
                        showNewTribu = true
                    }
                }
            }
            .refreshable { await state.refreshSocial() }
            .alert("Nouvelle tribu", isPresented: $showNewTribu) {
                TextField("Nom de la tribu", text: $newTribuName)
                Button("Créer") { Task { await state.createTribu(name: newTribuName) } }
                Button("Annuler", role: .cancel) {}
            }
            .sheet(item: $selectedProfile) { route in
                MiniProfileSheet(userID: route.id).presentationDetents([.medium, .large])
            }
        }
    }

    private func personRow(_ user: User) -> some View {
        Button { selectedProfile = ProfileRoute(id: user.id) } label: {
            HStack(spacing: 12) {
                AvatarView(name: user.firstName, photoData: user.photoData, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(user.firstName).font(.body.weight(.medium)).foregroundStyle(.primary)
                    Text(user.sportIDs.map(sportName).joined(separator: " · "))
                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
