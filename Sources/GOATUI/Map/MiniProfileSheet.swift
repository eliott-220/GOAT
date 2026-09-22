import SwiftUI
import GOATCore

/// Mini-profil affiché au tap sur un pin, une suggestion Echo ou un contact. Ne montre jamais de position.
struct MiniProfileSheet: View {
    let userID: UUID

    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var profile: MiniProfile?
    @State private var isLoaded = false
    @State private var confirmBlock = false
    @State private var showReportReasons = false

    private static let reportReasons = ["Comportement inapproprié", "Faux profil", "Spam", "Autre"]

    var body: some View {
        NavigationStack {
            Group {
                if let profile {
                    content(profile)
                } else if isLoaded {
                    ContentUnavailableView("Profil indisponible", systemImage: "person.slash")
                } else {
                    ProgressView()
                }
            }
            .navigationTitle(profile?.firstName ?? "")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } }
                if profile != nil {
                    ToolbarItem(placement: .primaryAction) {
                        Menu {
                            Button("Signaler", systemImage: "flag") { showReportReasons = true }
                            Button("Bloquer", systemImage: "hand.raised", role: .destructive) { confirmBlock = true }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                        }
                    }
                }
            }
        }
        .task { await load() }
        // Recharge aussi quand les Alliances changent ailleurs (ex. l'autre personne accepte pendant que la fiche est ouverte).
        .onChange(of: state.alliances) { Task { await load() } }
        .confirmationDialog("Bloquer \(profile?.firstName ?? "") ?", isPresented: $confirmBlock, titleVisibility: .visible) {
            Button("Bloquer", role: .destructive) {
                Task {
                    await state.block(userID)
                    dismiss()
                }
            }
        } message: {
            Text("Vous ne vous verrez plus sur la carte ni dans les Echos, et toute Alliance sera rompue.")
        }
        .confirmationDialog("Pourquoi signaler ce profil ?", isPresented: $showReportReasons, titleVisibility: .visible) {
            ForEach(Self.reportReasons, id: \.self) { reason in
                Button(reason) { Task { await state.report(userID, reason: reason) } }
            }
        }
    }

    private func content(_ profile: MiniProfile) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                AvatarView(name: profile.firstName, photoData: profile.photoData, size: 96)

                VStack(spacing: 4) {
                    Text(profile.firstName).font(.title.bold())
                    Text("Membre depuis \(profile.memberSince.formatted(.dateTime.month(.wide).year()))")
                        .font(.subheadline).foregroundStyle(.secondary)
                }

                if !profile.currentSportIDs.isEmpty {
                    HStack(spacing: 6) {
                        Circle().fill(Theme.live).frame(width: 8, height: 8)
                        Text("En ce moment : \(profile.currentSportIDs.map(sportName).joined(separator: ", "))")
                            .font(.subheadline.weight(.medium))
                    }
                }

                if !profile.bio.isEmpty {
                    Text(profile.bio).multilineTextAlignment(.center).foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Sports pratiqués").font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
                    SportBadges(sportIDs: profile.sportIDs)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                allianceControls(profile)
            }
            .padding()
        }
    }

    @ViewBuilder private func allianceControls(_ profile: MiniProfile) -> some View {
        switch profile.relation {
        case .none:
            Button {
                Task { await state.requestAlliance(to: profile.id); await load() }
            } label: {
                Label("Demander en Alliance", systemImage: "person.badge.plus").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent).controlSize(.large)
        case .requestSent:
            Label("Demande envoyée", systemImage: "clock").foregroundStyle(.secondary)
        case .requestReceived(let allianceID):
            HStack {
                Button {
                    Task { await state.respondToAlliance(id: allianceID, accept: true); await load() }
                } label: { Label("Accepter", systemImage: "checkmark").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent)
                Button {
                    Task { await state.respondToAlliance(id: allianceID, accept: false); await load() }
                } label: { Label("Refuser", systemImage: "xmark").frame(maxWidth: .infinity) }
                .buttonStyle(.bordered)
            }
            .controlSize(.large)
        case .allied:
            Label("Alliés", systemImage: "person.2.fill").foregroundStyle(Theme.live)
        }
    }

    private func load() async {
        profile = await state.profile(of: userID)
        isLoaded = true
    }
}
