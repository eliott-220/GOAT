import Foundation
import GOATCore

/// Persistance locale du profil (JSON dans Application Support), en attendant un vrai compte côté serveur.
struct LocalStore {
    private let fileURL: URL

    init(directory: URL? = nil) {
        let base = directory ?? FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("GOAT", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        fileURL = base.appendingPathComponent("me.json")
    }

    func loadUser() -> User? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(User.self, from: data)
    }

    func save(_ user: User) {
        guard let data = try? JSONEncoder().encode(user) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    func clear() {
        try? FileManager.default.removeItem(at: fileURL)
    }
}
