import SwiftUI
import GOATCore
import CoreLocation
import ImageIO
import UniformTypeIdentifiers

enum Theme {
    // Charte 2026 : accent or (repris de la version web, voir web/src/styles.css --gold), même vert "en direct".
    static let accent = Color(red: 0.965, green: 0.70, blue: 0.0)
    static let live = Color(red: 0.204, green: 0.816, blue: 0.361)

    static func color(for category: SportCategory) -> Color {
        switch category {
        case .glisse: Color(red: 0.20, green: 0.60, blue: 0.95)
        case .course: .orange
        case .velo: Color(red: 0.88, green: 0.63, blue: 0.0)
        case .ballon: Color(red: 0.20, green: 0.68, blue: 0.35)
        case .raquette: Color(red: 0.55, green: 0.75, blue: 0.15)
        case .salle: .purple
        case .nature: Color(red: 0.60, green: 0.42, blue: 0.25)
        case .eau: .teal
        case .combat: Color(red: 0.90, green: 0.28, blue: 0.30)
        case .multi: .indigo
        }
    }
}

extension Sport {
    var tint: Color { Theme.color(for: category) }
}

extension GeoCoordinate {
    var clCoordinate: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: latitude, longitude: longitude) }
}

func sportName(_ id: String) -> String { SportCatalog.sport(id: id)?.name ?? id }

func formatDuration(_ interval: TimeInterval) -> String {
    let minutes = Int(interval / 60)
    if minutes < 1 { return "< 1 min" }
    if minutes < 60 { return "\(minutes) min" }
    return String(format: "%d h %02d", minutes / 60, minutes % 60)
}

// MARK: - Composants

struct SportBadge: View {
    let sport: Sport
    var compact = false

    var body: some View {
        Label(sport.name, systemImage: sport.symbol)
            .font(compact ? .caption : .subheadline)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(sport.tint.opacity(0.15), in: Capsule())
            .foregroundStyle(sport.tint)
    }
}

struct SportBadges: View {
    let sportIDs: [String]

    var body: some View {
        // Retour à la ligne automatique sans dépendre d'un layout personnalisé.
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                ForEach(sportIDs.compactMap(SportCatalog.sport(id:))) { SportBadge(sport: $0, compact: true) }
            }
        }
    }
}

struct AvatarView: View {
    let name: String
    var photoData: Data?
    var size: CGFloat = 44

    var body: some View {
        content
            .frame(width: size, height: size)
            .clipShape(Circle())
            .accessibilityLabel("Photo de \(name)")
    }

    @ViewBuilder private var content: some View {
        if let photoData, let image = ImageCodec.image(from: photoData) {
            image.resizable().scaledToFill()
        } else {
            ZStack {
                Circle().fill(Theme.accent.gradient)
                Text(String(name.prefix(1)).uppercased())
                    .font(.system(size: size * 0.45, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
            }
        }
    }
}

/// Décodage / réduction d'image via ImageIO : identique sur iOS et macOS, sans UIKit.
enum ImageCodec {
    static func image(from data: Data) -> Image? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else { return nil }
        return Image(decorative: cgImage, scale: 1)
    }

    /// Réduit une photo à `maxPixel` px de côté max, encodée en JPEG (photo de profil légère).
    static func avatarJPEG(from data: Data, maxPixel: Int = 400) -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, thumbnail, [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary)
        return CGImageDestinationFinalize(destination) ? output as Data : nil
    }
}

struct ProfileRoute: Identifiable, Hashable {
    let id: UUID
}
