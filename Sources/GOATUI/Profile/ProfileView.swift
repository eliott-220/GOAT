import SwiftUI
import PhotosUI
import GOATCore

struct ProfileView: View {
    @Environment(AppState.self) private var state
    @State private var firstName = ""
    @State private var bio = ""
    @State private var photoItem: PhotosPickerItem?
    @State private var confirmSignOut = false

    private static let bioLimit = 140

    var body: some View {
        NavigationStack {
            Form {
                header
                Section("Sports") {
                    NavigationLink {
                        SportSelectionView(selection: sportsBinding)
                            .navigationTitle("Mes sports")
                    } label: {
                        HStack {
                            Text("Sports pratiqués")
                            Spacer()
                            Text("\(state.me?.sports.count ?? 0)").foregroundStyle(.secondary)
                        }
                    }
                    if let me = state.me, !me.sports.isEmpty {
                        SportBadges(sportIDs: me.sports.sorted { $0.isPrimary && !$1.isPrimary }.map(\.sportID))
                    }
                }

                Section {
                    NavigationLink {
                        VisibilitySettingsView()
                    } label: {
                        Label("Visibilité", systemImage: state.me?.visibility.isInvisible == true ? "eye.slash" : "eye")
                    }
                }

                Section("Historique des sessions") {
                    if state.history.isEmpty {
                        Text("Tes sessions terminées apparaîtront ici.").foregroundStyle(.secondary)
                    }
                    ForEach(state.history.prefix(20)) { session in
                        HStack {
                            if let sport = SportCatalog.sport(id: session.sportID) {
                                Image(systemName: sport.symbol).frame(width: 28).foregroundStyle(sport.tint)
                                Text(sport.name)
                            }
                            Spacer()
                            VStack(alignment: .trailing) {
                                Text(session.startedAt.formatted(.dateTime.day().month(.abbreviated).hour().minute()))
                                Text(formatDuration(session.duration(at: session.endedAt ?? session.startedAt)))
                                    .foregroundStyle(.secondary)
                            }
                            .font(.caption)
                        }
                    }
                }

                #if DEBUG
                if state.supportsDemoTools {
                    Section {
                        Button("Simuler 3 jours de pratique près d'un autre pratiquant") {
                            Task { await state.demoSimulateRecurringPractice() }
                        }
                    } header: {
                        Text("Outils de démo")
                    } footer: {
                        Text("Ajoute un historique fictif pour voir apparaître des Echos avec les utilisateurs simulés.")
                    }
                }
                #endif

                Section {
                    Button("Supprimer mon profil local", role: .destructive) { confirmSignOut = true }
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Profil")
            .onAppear(perform: syncDrafts)
            .onDisappear(perform: commitDrafts)
            .onChange(of: photoItem) { _, item in loadPhoto(item) }
            .confirmationDialog("Supprimer ton profil sur cet appareil ?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Supprimer", role: .destructive) { Task { await state.signOut() } }
            } message: {
                Text("Tes sessions en cours sont arrêtées et tu repasses par l'onboarding.")
            }
        }
    }

    private var header: some View {
        let name = state.me?.firstName ?? "?"
        let photo = state.me?.photoData
        return Section {
            HStack(spacing: 16) {
                PhotosPicker(selection: $photoItem, matching: .images) {
                    ZStack(alignment: .bottomTrailing) {
                        AvatarView(name: name, photoData: photo, size: 76)
                        Image(systemName: "camera.circle.fill")
                            .font(.title3).symbolRenderingMode(.multicolor)
                            .background(Circle().fill(.background))
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Changer la photo de profil")

                TextField("Prénom", text: $firstName)
                    .font(.title2.weight(.semibold))
                    .onSubmit(commitDrafts)
            }
            TextField("Bio courte", text: $bio, axis: .vertical)
                .lineLimit(1...3)
                .onChange(of: bio) { _, value in
                    if value.count > Self.bioLimit { bio = String(value.prefix(Self.bioLimit)) }
                }
                .onSubmit(commitDrafts)
        } footer: {
            Text("\(bio.count)/\(Self.bioLimit)")
        }
    }

    private var sportsBinding: Binding<[UserSport]> {
        Binding(
            get: { state.me?.sports ?? [] },
            set: { newValue in
                // Au moins un sport : sans quoi on ne pourrait plus démarrer de session.
                guard !newValue.isEmpty else { return }
                state.updateProfile { $0.sports = newValue }
            }
        )
    }

    private func syncDrafts() {
        firstName = state.me?.firstName ?? ""
        bio = state.me?.bio ?? ""
    }

    private func commitDrafts() {
        let name = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let me = state.me else { return }
        if name.isEmpty { firstName = me.firstName }
        let newName = name.isEmpty ? me.firstName : name
        guard newName != me.firstName || bio != me.bio else { return }
        state.updateProfile {
            $0.firstName = newName
            $0.bio = bio
        }
    }

    private func loadPhoto(_ item: PhotosPickerItem?) {
        guard let item else { return }
        Task {
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let jpeg = ImageCodec.avatarJPEG(from: data) else {
                state.errorMessage = "Impossible de charger cette photo."
                return
            }
            state.updateProfile { $0.photoData = jpeg }
            photoItem = nil
        }
    }
}
