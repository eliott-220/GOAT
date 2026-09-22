import SwiftUI
import GOATCore

/// Création de compte → choix des sports (un principal) → géolocalisation en opt-in explicite.
/// Le compte est local pour l'instant : l'authentification réelle viendra avec le backend.
struct OnboardingView: View {
    private enum Step { case welcome, sports, location }

    @Environment(AppState.self) private var state
    @State private var step: Step = .welcome
    @State private var firstName = ""
    @State private var sports: [UserSport] = []
    @State private var awaitingLocationAnswer = false

    private var trimmedName: String { firstName.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(spacing: 0) {
            switch step {
            case .welcome: welcome
            case .sports: sportsStep
            case .location: locationStep
            }
        }
        .animation(.easeInOut, value: step)
        .onChange(of: state.location.authorization) { _, status in
            // Le prompt système est résolu (autorisé ou refusé) : on entre dans l'app.
            if awaitingLocationAnswer, status != .notDetermined { finish() }
        }
    }

    // MARK: Étapes

    private var welcome: some View {
        VStack(alignment: .leading, spacing: 20) {
            Spacer()
            Image(systemName: "globe.europe.africa.fill")
                .font(.system(size: 64)).foregroundStyle(Theme.accent)
            Text("GOAT Métavers").font(.largeTitle.bold())
            Text("La carte vivante des sportifs. Vois qui pratique quoi, maintenant, près de toi — et croise-les pour de vrai.")
                .font(.title3).foregroundStyle(.secondary)
            TextField("Ton prénom", text: $firstName)
                .textFieldStyle(.roundedBorder)
                .textContentType(.givenName)
                .submitLabel(.next)
                .onSubmit { if !trimmedName.isEmpty { step = .sports } }
            Spacer()
            primaryButton("Continuer", enabled: !trimmedName.isEmpty) { step = .sports }
        }
        .padding(24)
    }

    private var sportsStep: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Tes sports").font(.largeTitle.bold())
                Text("Choisis ceux que tu pratiques, puis touche l'étoile pour définir ton sport principal.")
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding([.horizontal, .top], 24)
            .padding(.bottom, 8)

            SportSelectionView(selection: $sports)

            VStack {
                primaryButton("Continuer", enabled: !sports.isEmpty) { step = .location }
            }
            .padding(24)
        }
    }

    private var locationStep: some View {
        VStack(alignment: .leading, spacing: 20) {
            Spacer()
            Image(systemName: "location.circle.fill")
                .font(.system(size: 64)).foregroundStyle(Theme.accent)
            Text("Ta position, ton choix").font(.largeTitle.bold())
            VStack(alignment: .leading, spacing: 14) {
                bullet("mappin.and.ellipse", "Ta position n'est utilisée que pendant une session de sport.")
                bullet("circle.dashed", "Les autres ne voient qu'une zone approximative (~150 m), jamais ta position exacte.")
                bullet("eye.slash", "Tu peux te rendre invisible à tout moment.")
            }
            Spacer()
            primaryButton("Autoriser la localisation", enabled: true) {
                if state.location.authorization == .notDetermined {
                    awaitingLocationAnswer = true
                    state.location.requestPermission()
                } else {
                    finish()
                }
            }
            Button("Plus tard") { finish() }
                .frame(maxWidth: .infinity)
                .padding(.top, 4)
        }
        .padding(24)
    }

    // MARK: Helpers

    private func finish() {
        awaitingLocationAnswer = false
        Task { await state.completeOnboarding(firstName: trimmedName, sports: sports) }
    }

    private func primaryButton(_ title: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(!enabled)
    }

    private func bullet(_ symbol: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol).frame(width: 28).foregroundStyle(Theme.accent)
            Text(text)
        }
    }
}
