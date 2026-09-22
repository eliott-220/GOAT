import SwiftUI
import GOATCore

/// Choix des sports pratiqués + sport principal. Utilisé à l'onboarding et dans le profil.
struct SportSelectionView: View {
    @Binding var selection: [UserSport]

    var body: some View {
        List {
            ForEach(SportCategory.allCases, id: \.self) { category in
                Section(category.displayName) {
                    ForEach(SportCatalog.all.filter { $0.category == category }) { sport in
                        row(sport)
                    }
                }
            }
        }
    }

    private func row(_ sport: Sport) -> some View {
        let entry = selection.first { $0.sportID == sport.id }
        return HStack {
            Button {
                selection.toggle(sport.id)
            } label: {
                HStack {
                    Image(systemName: sport.symbol).frame(width: 32).foregroundStyle(sport.tint)
                    Text(sport.name).foregroundStyle(.primary)
                    Spacer()
                    Image(systemName: entry != nil ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(entry != nil ? Theme.accent : Color.secondary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if let entry {
                Button {
                    selection.makePrimary(sport.id)
                } label: {
                    Image(systemName: entry.isPrimary ? "star.fill" : "star")
                        .foregroundStyle(entry.isPrimary ? Color.yellow : Color.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(entry.isPrimary ? "Sport principal" : "Définir comme sport principal")
            }
        }
    }
}
